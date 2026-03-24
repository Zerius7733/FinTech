from __future__ import annotations

from typing import Any, Dict, Iterable, List


SG_TAX_BRACKETS = [
    (20000.0, 0.00),
    (30000.0, 0.02),
    (40000.0, 0.035),
    (80000.0, 0.07),
    (120000.0, 0.115),
    (160000.0, 0.15),
    (200000.0, 0.18),
    (240000.0, 0.19),
    (280000.0, 0.195),
    (320000.0, 0.20),
    (500000.0, 0.22),
    (1000000.0, 0.23),
    (float("inf"), 0.24),
]

US_SINGLE_TAX_BRACKETS = [
    (11925.0, 0.10),
    (48475.0, 0.12),
    (103350.0, 0.22),
    (197300.0, 0.24),
    (250525.0, 0.32),
    (626350.0, 0.35),
    (float("inf"), 0.37),
]

US_STANDARD_DEDUCTION_SINGLE = 16750.0
US_FICA_SOCIAL_SECURITY_CAP = 176100.0
US_FICA_SOCIAL_SECURITY_RATE = 0.062
US_FICA_MEDICARE_RATE = 0.0145

# Uses total monthly contribution rates for ordinary wages and a simplified
# allocation of the combined employee+employer contribution across CPF accounts.
CPF_CONTRIBUTION_RULES = [
    {
        "max_age": 55,
        "employee_rate": 0.20,
        "employer_rate": 0.17,
        "allocations": {"ordinary": 0.6217, "special": 0.1621, "medisave": 0.2162},
    },
    {
        "max_age": 60,
        "employee_rate": 0.17,
        "employer_rate": 0.15,
        "allocations": {"ordinary": 0.4625, "special": 0.2188, "medisave": 0.3187},
    },
    {
        "max_age": 65,
        "employee_rate": 0.115,
        "employer_rate": 0.115,
        "allocations": {"ordinary": 0.4091, "special": 0.1364, "medisave": 0.4545},
    },
    {
        "max_age": 70,
        "employee_rate": 0.075,
        "employer_rate": 0.09,
        "allocations": {"ordinary": 0.1818, "special": 0.1212, "medisave": 0.6970},
    },
    {
        "max_age": 200,
        "employee_rate": 0.05,
        "employer_rate": 0.075,
        "allocations": {"ordinary": 0.0833, "special": 0.0833, "medisave": 0.8334},
    },
]


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return default


def normalize_country(value: Any, *, fallback: str = "US") -> str:
    normalized = str(value or "").strip().upper()
    if normalized in {"SG", "SGP", "SINGAPORE"}:
        return "SG"
    if normalized in {"US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"}:
        return "US"
    return fallback


def _estimate_progressive_tax(annual_income: float, brackets: Iterable[tuple[float, float]]) -> float:
    if annual_income <= 0:
        return 0.0

    remaining = annual_income
    lower = 0.0
    tax = 0.0
    for upper, rate in brackets:
        taxable = min(remaining, upper - lower)
        if taxable <= 0:
            break
        tax += taxable * rate
        remaining -= taxable
        lower = upper
        if remaining <= 0:
            break
    return round(max(tax, 0.0), 2)


def _cpf_rule_for_age(age: Any) -> Dict[str, Any]:
    age_value = max(18, int(_to_float(age, 35)))
    for rule in CPF_CONTRIBUTION_RULES:
        if age_value <= rule["max_age"]:
            return rule
    return CPF_CONTRIBUTION_RULES[0]


def estimate_cpf_for_monthly_salary(monthly_gross: float, age: Any) -> Dict[str, Any]:
    gross = max(_to_float(monthly_gross), 0.0)
    rule = _cpf_rule_for_age(age)
    employee = round(gross * rule["employee_rate"], 2)
    employer = round(gross * rule["employer_rate"], 2)
    total = employee + employer
    allocations = {
        key: round(total * weight, 2)
        for key, weight in rule["allocations"].items()
    }
    return {
        "employee": employee,
        "employer": employer,
        "total": round(total, 2),
        "allocations": allocations,
        "employee_rate": rule["employee_rate"],
        "employer_rate": rule["employer_rate"],
    }


def estimate_tax_profile(
    *,
    country: str,
    annual_gross: float,
    age: Any = None,
    cpf_applicable: bool = False,
) -> Dict[str, Any]:
    normalized_country = normalize_country(country)
    annual_gross = max(_to_float(annual_gross), 0.0)

    if normalized_country == "SG":
        monthly_gross = annual_gross / 12.0 if annual_gross > 0 else 0.0
        cpf = estimate_cpf_for_monthly_salary(monthly_gross, age) if cpf_applicable else {
            "employee": 0.0,
            "employer": 0.0,
            "total": 0.0,
            "allocations": {"ordinary": 0.0, "special": 0.0, "medisave": 0.0},
            "employee_rate": 0.0,
            "employer_rate": 0.0,
        }
        annual_employee_cpf = round(cpf["employee"] * 12.0, 2)
        chargeable_income = max(annual_gross - annual_employee_cpf, 0.0)
        annual_tax = _estimate_progressive_tax(chargeable_income, SG_TAX_BRACKETS)
        annual_net = max(annual_gross - annual_employee_cpf - annual_tax, 0.0)
        return {
            "country": "SG",
            "annual_gross": round(annual_gross, 2),
            "annual_tax": annual_tax,
            "annual_net": round(annual_net, 2),
            "monthly_tax": round(annual_tax / 12.0, 2),
            "monthly_net": round(annual_net / 12.0, 2),
            "cpf": {
                "employee_monthly": cpf["employee"],
                "employer_monthly": cpf["employer"],
                "total_monthly": cpf["total"],
                "employee_annual": annual_employee_cpf,
                "employer_annual": round(cpf["employer"] * 12.0, 2),
                "total_annual": round(cpf["total"] * 12.0, 2),
                "accounts_monthly": cpf["allocations"],
                "accounts_annual": {key: round(value * 12.0, 2) for key, value in cpf["allocations"].items()},
                "employee_rate": cpf["employee_rate"],
                "employer_rate": cpf["employer_rate"],
            },
        }

    taxable_income = max(annual_gross - US_STANDARD_DEDUCTION_SINGLE, 0.0)
    federal_tax = _estimate_progressive_tax(taxable_income, US_SINGLE_TAX_BRACKETS)
    social_security = min(annual_gross, US_FICA_SOCIAL_SECURITY_CAP) * US_FICA_SOCIAL_SECURITY_RATE
    medicare = annual_gross * US_FICA_MEDICARE_RATE
    annual_tax = round(federal_tax + social_security + medicare, 2)
    annual_net = max(annual_gross - annual_tax, 0.0)
    return {
        "country": "US",
        "annual_gross": round(annual_gross, 2),
        "annual_tax": annual_tax,
        "annual_net": round(annual_net, 2),
        "monthly_tax": round(annual_tax / 12.0, 2),
        "monthly_net": round(annual_net / 12.0, 2),
        "cpf": {
            "employee_monthly": 0.0,
            "employer_monthly": 0.0,
            "total_monthly": 0.0,
            "employee_annual": 0.0,
            "employer_annual": 0.0,
            "total_annual": 0.0,
            "accounts_monthly": {"ordinary": 0.0, "special": 0.0, "medisave": 0.0},
            "accounts_annual": {"ordinary": 0.0, "special": 0.0, "medisave": 0.0},
            "employee_rate": 0.0,
            "employer_rate": 0.0,
        },
    }


def build_income_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    streams = user.get("income_streams")
    if not isinstance(streams, list):
        streams = []

    fallback_country = normalize_country(user.get("country"), fallback="SG")
    age = user.get("age")
    normalized_streams: List[Dict[str, Any]] = []
    totals = {
        "monthly_gross": 0.0,
        "monthly_net": 0.0,
        "monthly_tax": 0.0,
        "annual_gross": 0.0,
        "annual_net": 0.0,
        "annual_tax": 0.0,
        "cpf_employee_monthly": 0.0,
        "cpf_employer_monthly": 0.0,
        "cpf_total_monthly": 0.0,
        "cpf_employee_annual": 0.0,
        "cpf_employer_annual": 0.0,
        "cpf_total_annual": 0.0,
    }
    cpf_accounts_monthly = {"ordinary": 0.0, "special": 0.0, "medisave": 0.0}
    cpf_accounts_annual = {"ordinary": 0.0, "special": 0.0, "medisave": 0.0}

    for raw_stream in streams:
        if not isinstance(raw_stream, dict):
            continue
        country = normalize_country(raw_stream.get("tax_country"), fallback=fallback_country)
        income_type = str(raw_stream.get("income_type") or "salary").strip().lower()
        cpf_applicable = bool(raw_stream.get("cpf_applicable", country == "SG" and income_type == "salary"))
        gross_monthly = max(_to_float(raw_stream.get("gross_monthly_amount")), 0.0)
        provided_net_monthly = max(_to_float(raw_stream.get("monthly_amount")), 0.0)
        annual_bonus = max(_to_float(raw_stream.get("annual_bonus")), 0.0)

        if gross_monthly > 0:
            annual_gross = gross_monthly * 12.0 + annual_bonus
            estimate = estimate_tax_profile(
                country=country,
                annual_gross=annual_gross,
                age=age,
                cpf_applicable=cpf_applicable,
            )
            monthly_net = estimate["monthly_net"]
            monthly_tax = estimate["monthly_tax"]
        else:
            annual_gross = provided_net_monthly * 12.0
            estimate = estimate_tax_profile(
                country=country,
                annual_gross=annual_gross,
                age=age,
                cpf_applicable=False,
            )
            monthly_net = provided_net_monthly
            monthly_tax = 0.0
            estimate["annual_tax"] = 0.0
            estimate["monthly_tax"] = 0.0
            estimate["annual_net"] = round(monthly_net * 12.0, 2)
            estimate["monthly_net"] = round(monthly_net, 2)
            estimate["annual_gross"] = round(annual_gross, 2)
            estimate["cpf"] = {
                "employee_monthly": 0.0,
                "employer_monthly": 0.0,
                "total_monthly": 0.0,
                "employee_annual": 0.0,
                "employer_annual": 0.0,
                "total_annual": 0.0,
                "accounts_monthly": {"ordinary": 0.0, "special": 0.0, "medisave": 0.0},
                "accounts_annual": {"ordinary": 0.0, "special": 0.0, "medisave": 0.0},
                "employee_rate": 0.0,
                "employer_rate": 0.0,
            }

        normalized_stream = dict(raw_stream)
        normalized_stream["tax_country"] = country
        normalized_stream["income_type"] = income_type
        normalized_stream["cpf_applicable"] = cpf_applicable
        normalized_stream["gross_monthly_amount"] = round(gross_monthly, 2) if gross_monthly > 0 else 0.0
        normalized_stream["annual_bonus"] = round(annual_bonus, 2)
        normalized_stream["monthly_amount"] = round(monthly_net, 2)
        normalized_stream["tax_breakdown"] = estimate
        normalized_streams.append(normalized_stream)

        totals["monthly_gross"] += gross_monthly
        totals["monthly_net"] += monthly_net
        totals["monthly_tax"] += monthly_tax
        totals["annual_gross"] += estimate["annual_gross"]
        totals["annual_net"] += estimate["annual_net"]
        totals["annual_tax"] += estimate["annual_tax"]
        cpf_data = estimate["cpf"]
        totals["cpf_employee_monthly"] += cpf_data["employee_monthly"]
        totals["cpf_employer_monthly"] += cpf_data["employer_monthly"]
        totals["cpf_total_monthly"] += cpf_data["total_monthly"]
        totals["cpf_employee_annual"] += cpf_data["employee_annual"]
        totals["cpf_employer_annual"] += cpf_data["employer_annual"]
        totals["cpf_total_annual"] += cpf_data["total_annual"]
        for key in cpf_accounts_monthly:
            cpf_accounts_monthly[key] += cpf_data["accounts_monthly"].get(key, 0.0)
            cpf_accounts_annual[key] += cpf_data["accounts_annual"].get(key, 0.0)

    totals = {key: round(value, 2) for key, value in totals.items()}
    cpf_accounts_monthly = {key: round(value, 2) for key, value in cpf_accounts_monthly.items()}
    cpf_accounts_annual = {key: round(value, 2) for key, value in cpf_accounts_annual.items()}
    primary_country = normalized_streams[0]["tax_country"] if normalized_streams else fallback_country
    return {
        "country": primary_country,
        "monthly_gross": totals["monthly_gross"],
        "monthly_net": totals["monthly_net"],
        "monthly_tax": totals["monthly_tax"],
        "annual_gross": totals["annual_gross"],
        "annual_net": totals["annual_net"],
        "annual_tax": totals["annual_tax"],
        "effective_tax_rate": round((totals["annual_tax"] / totals["annual_gross"]) if totals["annual_gross"] > 0 else 0.0, 4),
        "streams": normalized_streams,
        "cpf": {
            "employee_monthly": totals["cpf_employee_monthly"],
            "employer_monthly": totals["cpf_employer_monthly"],
            "total_monthly": totals["cpf_total_monthly"],
            "employee_annual": totals["cpf_employee_annual"],
            "employer_annual": totals["cpf_employer_annual"],
            "total_annual": totals["cpf_total_annual"],
            "accounts_monthly": cpf_accounts_monthly,
            "accounts_annual": cpf_accounts_annual,
        },
    }

