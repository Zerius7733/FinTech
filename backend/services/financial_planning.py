from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Sequence

from backend.services.portfolio_impact import build_portfolio_impact
from backend.services.retirement import build_retirement_plan
from backend.services.subscription_registry import subscription_payload


CPF_MONTHLY_WAGE_THRESHOLD = 750.0
DEFAULT_CPF_ORDINARY_WAGE_CEILING = 8000.0

CPF_RATE_TABLE = [
    {
        "age_band": "55 and below",
        "min_age": None,
        "max_age": 55,
        "employer_rate": 0.17,
        "employee_rate": 0.20,
    },
    {
        "age_band": "Above 55 to 60",
        "min_age": 55,
        "max_age": 60,
        "employer_rate": 0.16,
        "employee_rate": 0.18,
    },
    {
        "age_band": "Above 60 to 65",
        "min_age": 60,
        "max_age": 65,
        "employer_rate": 0.125,
        "employee_rate": 0.125,
    },
    {
        "age_band": "Above 65 to 70",
        "min_age": 65,
        "max_age": 70,
        "employer_rate": 0.09,
        "employee_rate": 0.075,
    },
    {
        "age_band": "Above 70",
        "min_age": 70,
        "max_age": None,
        "employer_rate": 0.075,
        "employee_rate": 0.05,
    },
]

IRAS_RESIDENT_BRACKETS = [
    {"label": "First $20,000", "upper": 20_000, "rate": 0.0},
    {"label": "Next $10,000", "upper": 30_000, "rate": 0.02},
    {"label": "Next $10,000", "upper": 40_000, "rate": 0.035},
    {"label": "Next $40,000", "upper": 80_000, "rate": 0.07},
    {"label": "Next $40,000", "upper": 120_000, "rate": 0.115},
    {"label": "Next $40,000", "upper": 160_000, "rate": 0.15},
    {"label": "Next $40,000", "upper": 200_000, "rate": 0.18},
    {"label": "Next $40,000", "upper": 240_000, "rate": 0.19},
    {"label": "Next $40,000", "upper": 280_000, "rate": 0.195},
    {"label": "Next $40,000", "upper": 320_000, "rate": 0.20},
    {"label": "Next $180,000", "upper": 500_000, "rate": 0.22},
    {"label": "Next $500,000", "upper": 1_000_000, "rate": 0.23},
    {"label": "In excess of $1,000,000", "upper": None, "rate": 0.24},
]


def _to_float(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace("_", "").strip()
        if not cleaned:
            return default
        try:
            return float(cleaned)
        except ValueError:
            return default
    return default


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _clean_label(value: Any) -> str:
    return str(value or "").strip()


def _resolve_income_streams(user: Mapping[str, Any]) -> List[Dict[str, Any]]:
    streams = []
    raw_streams = _as_list(user.get("income_streams"))
    for item in raw_streams:
        if not isinstance(item, Mapping):
            continue
        monthly_amount = max(0.0, _to_float(item.get("monthly_amount")))
        if monthly_amount <= 0:
            continue
        streams.append(
            {
                "label": _clean_label(item.get("label")) or "Income stream",
                "monthly_amount": round(monthly_amount, 2),
                "category": _clean_label(item.get("category")) or "unspecified",
            }
        )

    if not streams:
        monthly_income = max(0.0, _to_float(user.get("income")))
        if monthly_income > 0:
            streams.append(
                {
                    "label": "Income field",
                    "monthly_amount": round(monthly_income, 2),
                    "category": "primary",
                }
            )
    return streams


def summarize_income(user: Mapping[str, Any]) -> Dict[str, Any]:
    streams = _resolve_income_streams(user)
    monthly_total = round(sum(item["monthly_amount"] for item in streams), 2)
    annual_total = round(monthly_total * 12.0, 2)
    return {
        "monthly_total": monthly_total,
        "annual_total": annual_total,
        "source": "income_streams" if streams and _as_list(user.get("income_streams")) else "income_field",
        "source_count": len(streams),
        "streams": streams,
    }


def _resolve_cpf_age_band(age: Any) -> Dict[str, Any]:
    numeric_age = None
    if age not in (None, ""):
        try:
            numeric_age = int(float(age))
        except (TypeError, ValueError):
            numeric_age = None

    if numeric_age is None:
        entry = CPF_RATE_TABLE[0]
        return {
            "age": None,
            "age_band": entry["age_band"],
            "employer_rate": entry["employer_rate"],
            "employee_rate": entry["employee_rate"],
            "assumed_age_band": True,
        }

    for entry in CPF_RATE_TABLE:
        min_age = entry["min_age"]
        max_age = entry["max_age"]
        if min_age is None and numeric_age <= max_age:
            return {
                "age": numeric_age,
                "age_band": entry["age_band"],
                "employer_rate": entry["employer_rate"],
                "employee_rate": entry["employee_rate"],
                "assumed_age_band": False,
            }
        if min_age is not None and numeric_age > min_age and (max_age is None or numeric_age <= max_age):
            return {
                "age": numeric_age,
                "age_band": entry["age_band"],
                "employer_rate": entry["employer_rate"],
                "employee_rate": entry["employee_rate"],
                "assumed_age_band": False,
            }

    entry = CPF_RATE_TABLE[-1]
    return {
        "age": numeric_age,
        "age_band": entry["age_band"],
        "employer_rate": entry["employer_rate"],
        "employee_rate": entry["employee_rate"],
        "assumed_age_band": False,
    }


def estimate_cpf_contributions(
    monthly_wage: float,
    *,
    age: Any = None,
    wage_ceiling: float = DEFAULT_CPF_ORDINARY_WAGE_CEILING,
) -> Dict[str, Any]:
    wage = max(0.0, _to_float(monthly_wage))
    capped_wage = min(wage, max(0.0, _to_float(wage_ceiling, DEFAULT_CPF_ORDINARY_WAGE_CEILING)))
    band = _resolve_cpf_age_band(age)

    if capped_wage <= CPF_MONTHLY_WAGE_THRESHOLD:
        employer_monthly = 0.0
        employee_monthly = 0.0
        rate_note = "Wages at or below $750 are not modeled by this simplified table."
    else:
        employer_monthly = round(capped_wage * band["employer_rate"], 2)
        employee_monthly = round(capped_wage * band["employee_rate"], 2)
        rate_note = "Rates model Singapore CPF contribution tables from 1 Jan 2026."

    total_monthly = round(employer_monthly + employee_monthly, 2)
    return {
        "age": band["age"],
        "age_band": band["age_band"],
        "assumed_age_band": band["assumed_age_band"],
        "monthly_wage": round(wage, 2),
        "wage_ceiling": round(max(0.0, _to_float(wage_ceiling, DEFAULT_CPF_ORDINARY_WAGE_CEILING)), 2),
        "applied_wage": round(capped_wage, 2),
        "employer_rate": round(band["employer_rate"] * 100.0, 2),
        "employee_rate": round(band["employee_rate"] * 100.0, 2),
        "total_rate": round((band["employer_rate"] + band["employee_rate"]) * 100.0, 2),
        "monthly_employer_cpf": employer_monthly,
        "monthly_employee_cpf": employee_monthly,
        "monthly_total_cpf": total_monthly,
        "annual_employer_cpf": round(employer_monthly * 12.0, 2),
        "annual_employee_cpf": round(employee_monthly * 12.0, 2),
        "annual_total_cpf": round(total_monthly * 12.0, 2),
        "note": rate_note,
    }


def _progressive_tax(amount: float) -> Dict[str, Any]:
    taxable_income = max(0.0, _to_float(amount))
    remaining = taxable_income
    lower_bound = 0.0
    tax_total = 0.0
    breakdown: List[Dict[str, Any]] = []

    for bracket in IRAS_RESIDENT_BRACKETS:
        if remaining <= 0:
            break
        upper = bracket["upper"]
        if upper is None:
            taxable_band = remaining
        else:
            taxable_band = max(0.0, min(remaining, upper - lower_bound))

        if taxable_band <= 0:
            lower_bound = float(upper or lower_bound)
            continue

        tax = round(taxable_band * bracket["rate"], 2)
        tax_total += tax
        breakdown.append(
            {
                "label": bracket["label"],
                "taxable_amount": round(taxable_band, 2),
                "rate": round(bracket["rate"] * 100.0, 2),
                "tax": tax,
            }
        )
        remaining -= taxable_band
        if upper is not None:
            lower_bound = float(upper)

    marginal_rate = breakdown[-1]["rate"] if breakdown else 0.0
    return {
        "taxable_income": round(taxable_income, 2),
        "tax": round(tax_total, 2),
        "marginal_rate": round(marginal_rate, 2),
        "breakdown": breakdown,
    }


def estimate_singapore_tax(
    annual_income: float,
    *,
    tax_residency: str = "resident",
    annual_reliefs: float = 0.0,
) -> Dict[str, Any]:
    gross_income = max(0.0, _to_float(annual_income))
    reliefs = max(0.0, _to_float(annual_reliefs))
    chargeable_income = max(0.0, gross_income - reliefs)
    residency = str(tax_residency or "resident").strip().lower()

    if residency == "resident":
        progressive = _progressive_tax(chargeable_income)
        tax = progressive["tax"]
        breakdown = progressive["breakdown"]
        model = "resident_progressive"
        note = "Resident tax estimate uses IRAS progressive tax bands from YA 2024 onwards."
    elif residency == "non_resident_employment":
        resident_tax = _progressive_tax(chargeable_income)["tax"]
        flat_tax = round(chargeable_income * 0.15, 2)
        tax = max(resident_tax, flat_tax)
        breakdown = [
            {
                "label": "Non-resident employment income",
                "taxable_amount": round(chargeable_income, 2),
                "rate": 15.0 if flat_tax >= resident_tax else round((resident_tax / chargeable_income) * 100.0, 2) if chargeable_income > 0 else 0.0,
                "tax": round(tax, 2),
            }
        ]
        model = "non_resident_employment"
        note = "Employment income for non-residents is modeled as the higher of 15% or resident progressive rates."
    else:
        tax = round(chargeable_income * 0.24, 2)
        breakdown = [
            {
                "label": "Non-resident other income",
                "taxable_amount": round(chargeable_income, 2),
                "rate": 24.0,
                "tax": tax,
            }
        ]
        model = "non_resident_other"
        note = "Non-resident non-employment income is modeled at the current 24% flat rate."

    effective_rate = round((tax / chargeable_income) * 100.0, 2) if chargeable_income > 0 else 0.0
    return {
        "tax_residency": residency,
        "model": model,
        "gross_income": round(gross_income, 2),
        "annual_reliefs": round(reliefs, 2),
        "chargeable_income": round(chargeable_income, 2),
        "estimated_tax": round(tax, 2),
        "effective_rate": effective_rate,
        "marginal_rate": breakdown[-1]["rate"] if breakdown else 0.0,
        "breakdown": breakdown,
        "note": note,
    }


def _build_household_participant(
    name: str,
    monthly_income: float,
    monthly_expenses: float,
    *,
    is_primary: bool = False,
) -> Dict[str, Any]:
    return {
        "name": name,
        "monthly_income": round(max(0.0, _to_float(monthly_income)), 2),
        "monthly_expenses": round(max(0.0, _to_float(monthly_expenses)), 2),
        "is_primary": is_primary,
    }


def _participant_split(participants: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    total_income = sum(max(0.0, _to_float(item.get("monthly_income"))) for item in participants)
    if total_income <= 0:
        equal_share = 1.0 / len(participants) if participants else 0.0
        return [
            {
                "name": _clean_label(item.get("name")) or "Participant",
                "share": round(equal_share * 100.0, 2),
                "share_ratio": equal_share,
            }
            for item in participants
        ]

    split: List[Dict[str, Any]] = []
    for item in participants:
        income = max(0.0, _to_float(item.get("monthly_income")))
        share = income / total_income if total_income > 0 else 0.0
        split.append(
            {
                "name": _clean_label(item.get("name")) or "Participant",
                "share": round(share * 100.0, 2),
                "share_ratio": share,
            }
        )
    return split


def build_household_summary(
    user: Mapping[str, Any],
    household_members: Iterable[Mapping[str, Any]] | None = None,
    shared_goals: Iterable[Mapping[str, Any]] | None = None,
    *,
    monthly_expenses: float | None = None,
) -> Dict[str, Any]:
    income_summary = summarize_income(user)
    primary_income = income_summary["monthly_total"]
    primary_expenses = max(0.0, _to_float(monthly_expenses if monthly_expenses is not None else user.get("expenses")))
    primary_name = _clean_label(user.get("name")) or "Primary user"
    participants = [_build_household_participant(primary_name, primary_income, primary_expenses, is_primary=True)]

    raw_members = household_members or []
    for item in raw_members:
        if not isinstance(item, Mapping):
            continue
        participants.append(
            _build_household_participant(
                _clean_label(item.get("name")) or "Household member",
                item.get("monthly_income"),
                item.get("monthly_expenses"),
            )
        )

    total_income = round(sum(_to_float(item["monthly_income"]) for item in participants), 2)
    total_expenses = round(sum(_to_float(item["monthly_expenses"]) for item in participants), 2)
    surplus = round(total_income - total_expenses, 2)
    participant_split = _participant_split(participants)

    goals: List[Dict[str, Any]] = []
    goal_inputs = shared_goals or []
    for goal in goal_inputs:
        if not isinstance(goal, Mapping):
            continue
        target_amount = max(0.0, _to_float(goal.get("target_amount")))
        target_months = max(1, int(_to_float(goal.get("target_months"), 1)))
        owners = [str(owner).strip() for owner in _as_list(goal.get("owners")) if str(owner).strip()]
        required_monthly = round(target_amount / target_months, 2)

        goal_participants = participants
        if owners:
            selected = [
                participant
                for participant in participants
                if _clean_label(participant.get("name")) in owners
            ]
            if selected:
                goal_participants = selected

        goal_split = _participant_split(goal_participants)
        goals.append(
            {
                "name": _clean_label(goal.get("name")) or "Shared goal",
                "target_amount": round(target_amount, 2),
                "target_months": target_months,
                "required_monthly_contribution": required_monthly,
                "priority": int(_to_float(goal.get("priority"), 3)),
                "owners": owners,
                "recommended_split": [
                    {
                        "name": item["name"],
                        "share": item["share"],
                        "monthly_contribution": round(required_monthly * (item["share_ratio"] or 0.0), 2),
                    }
                    for item in goal_split
                ],
            }
        )

    return {
        "members": participants,
        "member_split": participant_split,
        "monthly_income": total_income,
        "monthly_expenses": total_expenses,
        "monthly_surplus": surplus,
        "shared_goals": goals,
    }


def build_financial_planning_overview(
    user: Mapping[str, Any],
    *,
    horizon_years: int = 5,
) -> Dict[str, Any]:
    income_summary = summarize_income(user)
    cpf_summary = estimate_cpf_contributions(
        income_summary["monthly_total"],
        age=user.get("age"),
    )
    tax_summary = estimate_singapore_tax(income_summary["annual_total"])
    household_summary = build_household_summary(user, monthly_expenses=user.get("expenses"))
    portfolio_impact = build_portfolio_impact(user, horizon_years=horizon_years)

    notes = [
        "Income is derived from income_streams first, then the legacy income field.",
        "CPF is modeled as a wage estimate and may differ from payroll treatment for non-wage income.",
        "Tax uses current IRAS resident progressive bands unless a different residency mode is requested.",
    ]

    return {
        "income": income_summary,
        "cpf": cpf_summary,
        "tax": tax_summary,
        "household": household_summary,
        "portfolio_impact": portfolio_impact,
        "subscription": subscription_payload(user if isinstance(user, Mapping) else None),
        "notes": notes,
    }


def build_financial_planning_scenario(
    user: Mapping[str, Any],
    *,
    cpf_age: Any = None,
    cpf_eligible_monthly_income: float | None = None,
    cpf_ordinary_wage_ceiling: float = DEFAULT_CPF_ORDINARY_WAGE_CEILING,
    tax_residency: str = "resident",
    annual_reliefs: float = 0.0,
    household_members: Iterable[Mapping[str, Any]] | None = None,
    shared_goals: Iterable[Mapping[str, Any]] | None = None,
    retirement_age: int | None = None,
    monthly_expenses: float | None = None,
    essential_monthly_expenses: float | None = None,
    horizon_years: int = 5,
) -> Dict[str, Any]:
    income_summary = summarize_income(user)
    cpf_monthly_wage = (
        max(0.0, _to_float(cpf_eligible_monthly_income))
        if cpf_eligible_monthly_income is not None
        else income_summary["monthly_total"]
    )
    cpf_summary = estimate_cpf_contributions(
        cpf_monthly_wage,
        age=cpf_age if cpf_age is not None else user.get("age"),
        wage_ceiling=cpf_ordinary_wage_ceiling,
    )
    tax_summary = estimate_singapore_tax(
        income_summary["annual_total"],
        tax_residency=tax_residency,
        annual_reliefs=annual_reliefs,
    )
    household_summary = build_household_summary(
        user,
        household_members=household_members,
        shared_goals=shared_goals,
        monthly_expenses=monthly_expenses,
    )
    portfolio_impact = build_portfolio_impact(user, horizon_years=horizon_years)

    scenario_notes = []
    resolved_monthly_expenses = max(0.0, _to_float(monthly_expenses if monthly_expenses is not None else user.get("expenses")))
    resolved_essential_expenses = max(
        0.0,
        _to_float(
            essential_monthly_expenses if essential_monthly_expenses is not None else resolved_monthly_expenses * 0.75
        ),
    )
    retirement_plan = None
    if retirement_age is not None:
        if resolved_monthly_expenses <= 0:
            scenario_notes.append("Retirement plan skipped because monthly_expenses was not supplied.")
        elif user.get("age") in (None, "", 0, "0"):
            scenario_notes.append("Retirement plan skipped because user age is missing.")
        else:
            retirement_plan = build_retirement_plan(
                dict(user),
                retirement_age=retirement_age,
                monthly_expenses=resolved_monthly_expenses,
                essential_monthly_expenses=min(resolved_monthly_expenses, resolved_essential_expenses or resolved_monthly_expenses),
            )

    monthly_take_home = round(
        max(
            0.0,
            income_summary["monthly_total"] - cpf_summary["monthly_employee_cpf"] - (tax_summary["estimated_tax"] / 12.0),
        ),
        2,
    )
    after_expenses = None
    if resolved_monthly_expenses > 0:
        after_expenses = round(monthly_take_home - resolved_monthly_expenses, 2)

    scenario = {
        "monthly_take_home_before_expenses": monthly_take_home,
        "monthly_take_home_after_expenses": after_expenses,
        "retirement": retirement_plan,
        "portfolio_impact": portfolio_impact,
        "notes": scenario_notes,
        "inputs": {
            "cpf_age": cpf_summary["age"],
            "cpf_eligible_monthly_income": round(cpf_monthly_wage, 2),
            "cpf_ordinary_wage_ceiling": round(max(0.0, _to_float(cpf_ordinary_wage_ceiling, DEFAULT_CPF_ORDINARY_WAGE_CEILING)), 2),
            "tax_residency": str(tax_residency or "resident").strip().lower(),
            "annual_reliefs": round(max(0.0, _to_float(annual_reliefs)), 2),
            "monthly_expenses": round(resolved_monthly_expenses, 2),
            "essential_monthly_expenses": round(resolved_essential_expenses, 2),
            "horizon_years": horizon_years,
        },
    }

    return {
        "income": income_summary,
        "cpf": cpf_summary,
        "tax": tax_summary,
        "household": household_summary,
        "scenario": scenario,
        "subscription": subscription_payload(user if isinstance(user, Mapping) else None),
        "notes": [
            "This is an estimation layer built from current profile data and request-time assumptions.",
            "CPF and tax figures are modeled from current Singapore tables and should be reviewed before filing or payroll use.",
        ]
        + scenario_notes,
    }
