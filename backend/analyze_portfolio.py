from backend.services.wealth_wellness.engine import update_wellness_file


def main() -> None:
    update_wellness_file("json_data/user.json")

if __name__ == "__main__":
    main()
