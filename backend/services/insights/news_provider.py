import email.utils
import os
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Protocol
from urllib.parse import quote_plus
from urllib.parse import urlparse

import httpx
import yfinance as yf


@dataclass
class NewsItem:
    headline: str
    source: str
    url: str
    published_at: str


class TTLCache:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = ttl_seconds
        self._store: Dict[str, tuple[float, List[NewsItem]]] = {}

    def get(self, key: str) -> Optional[List[NewsItem]]:
        found = self._store.get(key)
        if not found:
            return None
        expires_at, payload = found
        if time.time() >= expires_at:
            self._store.pop(key, None)
            return None
        return payload

    def set(self, key: str, payload: List[NewsItem]) -> None:
        self._store[key] = (time.time() + self.ttl_seconds, payload)


class NewsProvider(Protocol):
    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        ...

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        ...


def _now_utc_date() -> date:
    return datetime.now(timezone.utc).date()


def _extract_first_publisher_url_from_description(description_html: str) -> str:
    if not description_html:
        return ""
    hrefs = re.findall(r'href=[\"\'](https?://[^\"\']+)[\"\']', description_html, flags=re.IGNORECASE)
    for candidate in hrefs:
        host = (urlparse(candidate).netloc or "").lower()
        if "news.google.com" in host:
            continue
        return candidate.strip()
    return ""


class GoogleNewsRSSProvider:
    def __init__(self, client: httpx.AsyncClient, *, ttl_seconds: int = 1800) -> None:
        self.client = client
        self.cache = TTLCache(ttl_seconds=ttl_seconds)

    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        cache_key = f"google:{query}:{max_items}:{published_after or ''}:{published_before or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached[:max_items]

        query_parts = [query]
        if published_after:
            query_parts.append(f"after:{published_after}")
        if published_before:
            query_parts.append(f"before:{published_before}")
        elif not published_after:
            query_parts.append("when:7d")

        rss_url = "https://news.google.com/rss/search?" f"q={quote_plus(' '.join(query_parts))}&hl=en-US&gl=US&ceid=US:en"
        results: List[NewsItem] = []
        recent_fallback: List[NewsItem] = []
        today = _now_utc_date()

        try:
            response = await self.client.get(rss_url, timeout=10.0)
            if response.status_code >= 400:
                self.cache.set(cache_key, [])
                return []

            root = ET.fromstring(response.text)
            for item in root.findall(".//item"):
                title = (item.findtext("title") or "").strip()
                url = (item.findtext("link") or "").strip()
                description_html = (item.findtext("description") or "").strip()
                source = (item.findtext("source") or "").strip()
                pub_raw = (item.findtext("pubDate") or "").strip()
                if not title or not url:
                    continue

                publisher_url = _extract_first_publisher_url_from_description(description_html)
                if publisher_url:
                    url = publisher_url

                try:
                    dt = email.utils.parsedate_to_datetime(pub_raw)
                except Exception:
                    continue
                if dt is None:
                    continue
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                dt_utc = dt.astimezone(timezone.utc)
                news_item = NewsItem(
                    headline=title,
                    source=source,
                    url=url,
                    published_at=dt_utc.date().isoformat(),
                )
                if published_after or published_before:
                    if published_after and news_item.published_at < published_after:
                        continue
                    if published_before and news_item.published_at > published_before:
                        continue
                elif dt_utc.date() != today:
                    if 0 <= (today - dt_utc.date()).days <= 7:
                        recent_fallback.append(news_item)
                    continue
                results.append(news_item)
                if len(results) >= max_items:
                    break
        except Exception:
            results = []

        if not results and recent_fallback:
            results = recent_fallback[:max_items]

        self.cache.set(cache_key, results)
        return results

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        return await self.search(
            f"{symbol} latest news",
            max_items=max_items,
            published_after=published_after,
            published_before=published_before,
        )


class YahooFinanceNewsProvider:
    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        return []

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        out: List[NewsItem] = []
        try:
            ticker = yf.Ticker(symbol)
            items = ticker.news or []
        except Exception:
            return out

        for item in items:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            url = str(item.get("link", "")).strip()
            source = str(item.get("publisher", "")).strip()
            ts = item.get("providerPublishTime")
            published = ""
            if isinstance(ts, (int, float)) and ts > 0:
                published = datetime.fromtimestamp(float(ts), tz=timezone.utc).date().isoformat()
            if title and url:
                if published_after and published and published < published_after:
                    continue
                if published_before and published and published > published_before:
                    continue
                out.append(
                    NewsItem(
                        headline=title,
                        source=source,
                        url=url,
                        published_at=published,
                    )
                )
            if len(out) >= max_items:
                break
        return out


class NewsAPIProvider:
    def __init__(self, client: httpx.AsyncClient, api_key: str, *, ttl_seconds: int = 900) -> None:
        self.client = client
        self.api_key = api_key.strip()
        self.cache = TTLCache(ttl_seconds=ttl_seconds)

    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        cache_key = f"newsapi:search:{query}:{max_items}:{published_after or ''}:{published_before or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached[:max_items]

        today = _now_utc_date()
        from_date = published_after or (today - timedelta(days=7)).isoformat()
        try:
            params = {
                "q": query,
                "from": from_date,
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": max_items,
            }
            if published_before:
                params["to"] = published_before
            response = await self.client.get(
                "https://newsapi.org/v2/everything",
                params=params,
                headers={"X-Api-Key": self.api_key},
                timeout=10.0,
            )
            if response.status_code >= 400:
                self.cache.set(cache_key, [])
                return []
            payload = response.json()
        except Exception:
            payload = {}

        results = self._parse_articles(payload, max_items=max_items)
        self.cache.set(cache_key, results)
        return results

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        return await self.search(
            symbol,
            max_items=max_items,
            published_after=published_after,
            published_before=published_before,
        )

    def _parse_articles(self, payload: object, *, max_items: int) -> List[NewsItem]:
        if not isinstance(payload, dict):
            return []
        articles = payload.get("articles", [])
        if not isinstance(articles, list):
            return []

        out: List[NewsItem] = []
        for article in articles:
            if not isinstance(article, dict):
                continue
            title = str(article.get("title", "")).strip()
            url = str(article.get("url", "")).strip()
            published_raw = str(article.get("publishedAt", "")).strip()
            source = ""
            source_obj = article.get("source")
            if isinstance(source_obj, dict):
                source = str(source_obj.get("name", "")).strip()
            published = ""
            if published_raw:
                published = published_raw[:10]
            if title and url:
                out.append(
                    NewsItem(
                        headline=title,
                        source=source,
                        url=url,
                        published_at=published,
                    )
                )
            if len(out) >= max_items:
                break
        return out


class AlphaVantageNewsProvider:
    def __init__(self, client: httpx.AsyncClient, api_key: str, *, ttl_seconds: int = 900) -> None:
        self.client = client
        self.api_key = api_key.strip()
        self.cache = TTLCache(ttl_seconds=ttl_seconds)

    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        return []

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        cache_key = f"alphavantage:symbol:{symbol}:{max_items}:{published_after or ''}:{published_before or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached[:max_items]

        today = datetime.now(timezone.utc)
        if published_after:
            start_dt = datetime.fromisoformat(f"{published_after}T00:00:00+00:00")
        else:
            start_dt = today - timedelta(days=7)
        time_from = start_dt.strftime("%Y%m%dT%H%M")
        try:
            response = await self.client.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "NEWS_SENTIMENT",
                    "tickers": symbol,
                    "time_from": time_from,
                    "sort": "LATEST",
                    "limit": max_items,
                    "apikey": self.api_key,
                },
                timeout=10.0,
            )
            if response.status_code >= 400:
                self.cache.set(cache_key, [])
                return []
            payload = response.json()
        except Exception:
            payload = {}

        results = self._parse_feed(payload, max_items=max_items)
        self.cache.set(cache_key, results)
        return results

    def _parse_feed(self, payload: object, *, max_items: int) -> List[NewsItem]:
        if not isinstance(payload, dict):
            return []
        feed = payload.get("feed", [])
        if not isinstance(feed, list):
            return []

        out: List[NewsItem] = []
        for item in feed:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            url = str(item.get("url", "")).strip()
            source = str(item.get("source", "")).strip()
            published_raw = str(item.get("time_published", "")).strip()
            published = published_raw[:8]
            if len(published) == 8:
                published = f"{published[0:4]}-{published[4:6]}-{published[6:8]}"
            else:
                published = ""
            if title and url:
                out.append(
                    NewsItem(
                        headline=title,
                        source=source,
                        url=url,
                        published_at=published,
                    )
                )
            if len(out) >= max_items:
                break
        return out


class GDELTNewsProvider:
    def __init__(self, client: httpx.AsyncClient, *, ttl_seconds: int = 900) -> None:
        self.client = client
        self.cache = TTLCache(ttl_seconds=ttl_seconds)

    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        cache_key = f"gdelt:search:{query}:{max_items}:{published_after or ''}:{published_before or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached[:max_items]

        try:
            params = {
                "query": query,
                "mode": "artlist",
                "format": "json",
                "sort": "datedesc",
                "maxrecords": max_items,
            }
            if published_after:
                params["startdatetime"] = published_after.replace("-", "") + "000000"
            if published_before:
                params["enddatetime"] = published_before.replace("-", "") + "235959"
            if not published_after and not published_before:
                params["timespan"] = "7d"
            response = await self.client.get(
                "https://api.gdeltproject.org/api/v2/doc/doc",
                params=params,
                timeout=10.0,
            )
            if response.status_code >= 400:
                self.cache.set(cache_key, [])
                return []
            payload = response.json()
        except Exception:
            payload = {}

        results = self._parse_articles(payload, max_items=max_items)
        self.cache.set(cache_key, results)
        return results

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        return await self.search(
            f"{symbol} latest news",
            max_items=max_items,
            published_after=published_after,
            published_before=published_before,
        )

    def _parse_articles(self, payload: object, *, max_items: int) -> List[NewsItem]:
        if not isinstance(payload, dict):
            return []
        articles = payload.get("articles", [])
        if not isinstance(articles, list):
            return []

        out: List[NewsItem] = []
        for article in articles:
            if not isinstance(article, dict):
                continue
            title = str(article.get("title", "")).strip()
            url = str(article.get("url", "")).strip()
            source = str(article.get("domain", "")).strip()
            published_raw = str(article.get("seendate", "")).strip()
            published = published_raw[:10].replace("/", "-")
            if title and url:
                out.append(
                    NewsItem(
                        headline=title,
                        source=source,
                        url=url,
                        published_at=published,
                    )
                )
            if len(out) >= max_items:
                break
        return out


class MarketauxNewsProvider:
    def __init__(self, client: httpx.AsyncClient, api_key: str, *, ttl_seconds: int = 900) -> None:
        self.client = client
        self.api_key = api_key.strip()
        self.cache = TTLCache(ttl_seconds=ttl_seconds)

    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        cache_key = f"marketaux:search:{query}:{max_items}:{published_after or ''}:{published_before or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached[:max_items]

        today = _now_utc_date()
        from_date = published_after or (today - timedelta(days=7)).isoformat()
        try:
            params = {
                "api_token": self.api_key,
                "search": query,
                "language": "en",
                "published_after": from_date,
                "sort": "published_desc",
                "limit": max_items,
            }
            if published_before:
                params["published_before"] = published_before
            response = await self.client.get(
                "https://api.marketaux.com/v1/news/all",
                params=params,
                timeout=10.0,
            )
            if response.status_code >= 400:
                self.cache.set(cache_key, [])
                return []
            payload = response.json()
        except Exception:
            payload = {}

        results = self._parse_data(payload, max_items=max_items)
        self.cache.set(cache_key, results)
        return results

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        cache_key = f"marketaux:symbol:{symbol}:{max_items}:{published_after or ''}:{published_before or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached[:max_items]

        today = _now_utc_date()
        from_date = published_after or (today - timedelta(days=7)).isoformat()
        try:
            params = {
                "api_token": self.api_key,
                "symbols": symbol,
                "filter_entities": "true",
                "language": "en",
                "published_after": from_date,
                "sort": "published_desc",
                "limit": max_items,
            }
            if published_before:
                params["published_before"] = published_before
            response = await self.client.get(
                "https://api.marketaux.com/v1/news/all",
                params=params,
                timeout=10.0,
            )
            if response.status_code >= 400:
                self.cache.set(cache_key, [])
                return []
            payload = response.json()
        except Exception:
            payload = {}

        results = self._parse_data(payload, max_items=max_items)
        self.cache.set(cache_key, results)
        return results

    def _parse_data(self, payload: object, *, max_items: int) -> List[NewsItem]:
        if not isinstance(payload, dict):
            return []
        items = payload.get("data", [])
        if not isinstance(items, list):
            return []

        out: List[NewsItem] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            url = str(item.get("url", "")).strip()
            source = str(item.get("source", "")).strip()
            published_raw = str(item.get("published_at", "")).strip()
            published = published_raw[:10] if published_raw else ""
            if title and url:
                out.append(
                    NewsItem(
                        headline=title,
                        source=source,
                        url=url,
                        published_at=published,
                    )
                )
            if len(out) >= max_items:
                break
        return out


class FMPNewsProvider:
    def __init__(self, client: httpx.AsyncClient, api_key: str, *, ttl_seconds: int = 900) -> None:
        self.client = client
        self.api_key = api_key.strip()
        self.cache = TTLCache(ttl_seconds=ttl_seconds)

    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        return []

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        cache_key = f"fmp:symbol:{symbol}:{max_items}:{published_after or ''}:{published_before or ''}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached[:max_items]

        results = await self._fetch_stock_news(
            symbol,
            max_items=max_items,
            published_after=published_after,
            published_before=published_before,
        )
        if not results:
            results = await self._fetch_press_releases(
                symbol,
                max_items=max_items,
                published_after=published_after,
                published_before=published_before,
            )
        self.cache.set(cache_key, results)
        return results

    async def _fetch_stock_news(
        self,
        symbol: str,
        *,
        max_items: int,
        published_after: Optional[str],
        published_before: Optional[str],
    ) -> List[NewsItem]:
        try:
            response = await self.client.get(
                "https://financialmodelingprep.com/stable/news/stock",
                params={
                    "symbols": symbol,
                    "limit": max_items,
                    "apikey": self.api_key,
                },
                timeout=10.0,
            )
            if response.status_code >= 400:
                return []
            payload = response.json()
        except Exception:
            payload = []
        return self._parse_list(
            payload,
            max_items=max_items,
            published_after=published_after,
            published_before=published_before,
        )

    async def _fetch_press_releases(
        self,
        symbol: str,
        *,
        max_items: int,
        published_after: Optional[str],
        published_before: Optional[str],
    ) -> List[NewsItem]:
        try:
            response = await self.client.get(
                "https://financialmodelingprep.com/stable/news/press-releases",
                params={
                    "symbols": symbol,
                    "limit": max_items,
                    "apikey": self.api_key,
                },
                timeout=10.0,
            )
            if response.status_code >= 400:
                return []
            payload = response.json()
        except Exception:
            payload = []
        return self._parse_list(
            payload,
            max_items=max_items,
            published_after=published_after,
            published_before=published_before,
        )

    def _parse_list(
        self,
        payload: object,
        *,
        max_items: int,
        published_after: Optional[str],
        published_before: Optional[str],
    ) -> List[NewsItem]:
        if not isinstance(payload, list):
            return []

        out: List[NewsItem] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            url = str(item.get("url", "")).strip()
            source = str(item.get("site", "") or item.get("source", "")).strip()
            published_raw = str(item.get("publishedDate", "") or item.get("published_at", "")).strip()
            published = published_raw[:10] if published_raw else ""
            if title and url:
                if published_after and published and published < published_after:
                    continue
                if published_before and published and published > published_before:
                    continue
                out.append(
                    NewsItem(
                        headline=title,
                        source=source,
                        url=url,
                        published_at=published,
                    )
                )
            if len(out) >= max_items:
                break
        return out


class CompositeNewsProvider:
    def __init__(
        self,
        *,
        search_providers: List[NewsProvider],
        symbol_providers: List[NewsProvider],
    ) -> None:
        self.search_providers = search_providers
        self.symbol_providers = symbol_providers

    async def search(
        self,
        query: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        combined: List[NewsItem] = []
        seen_urls = set()
        for provider in self.search_providers:
            results = await provider.search(
                query,
                max_items=max_items,
                published_after=published_after,
                published_before=published_before,
            )
            for item in results:
                url = item.url.strip()
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                combined.append(item)
                if len(combined) >= max_items:
                    return combined
        return combined

    async def latest_for_symbol(
        self,
        symbol: str,
        *,
        max_items: int = 10,
        published_after: Optional[str] = None,
        published_before: Optional[str] = None,
    ) -> List[NewsItem]:
        combined: List[NewsItem] = []
        seen_urls = set()
        for provider in self.symbol_providers:
            results = await provider.latest_for_symbol(
                symbol,
                max_items=max_items,
                published_after=published_after,
                published_before=published_before,
            )
            for item in results:
                url = item.url.strip()
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                combined.append(item)
                if len(combined) >= max_items:
                    return combined
        return combined


def build_default_news_provider(client: httpx.AsyncClient) -> CompositeNewsProvider:
    search_providers: List[NewsProvider] = []
    symbol_providers: List[NewsProvider] = []

    newsapi_key = os.getenv("NEWSAPI_KEY", "").strip()
    if newsapi_key:
        newsapi = NewsAPIProvider(client, newsapi_key)
        search_providers.append(newsapi)
        symbol_providers.append(newsapi)

    alpha_vantage_key = os.getenv("ALPHAVANTAGE_API_KEY", "").strip()
    if alpha_vantage_key:
        alpha_vantage = AlphaVantageNewsProvider(client, alpha_vantage_key)
        symbol_providers.append(alpha_vantage)

    marketaux_key = os.getenv("MARKETAUX_API_KEY", "").strip()
    if marketaux_key:
        marketaux = MarketauxNewsProvider(client, marketaux_key)
        search_providers.append(marketaux)
        symbol_providers.append(marketaux)

    fmp_key = os.getenv("FMP_API_KEY", "").strip()
    if fmp_key:
        fmp = FMPNewsProvider(client, fmp_key)
        symbol_providers.append(fmp)

    gdelt = GDELTNewsProvider(client)
    google_news = GoogleNewsRSSProvider(client)
    yahoo_finance = YahooFinanceNewsProvider()
    search_providers.extend([gdelt, google_news])
    symbol_providers.extend([gdelt, google_news, yahoo_finance])

    return CompositeNewsProvider(
        search_providers=search_providers,
        symbol_providers=symbol_providers,
    )
