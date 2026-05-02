import os
import json
import requests

base_url = "https://statsapi.mlb.com/api/v1/teams/141/roster/fullRoster"

player_dict = {}

for season in range(2007, 2027):
    print(f"getting stats for season {season}. . .")
    res = requests.get(base_url, params={"season": season})
    if res.status_code == 200:
        print("got stats, storing . . .")
        data = res.json()
        for player in data["roster"]:
            if player["person"]["id"] not in player_dict:
                player_dict[player["person"]["id"]] = {
                    "link": player["person"]["link"],
                    "fullName": player["person"]["fullName"],
                    "position": player["position"]["name"]
                }
    else:
        print(f"error {res.status_code}")

with open(os.path.join("data", "players.json"), "w") as jsf:
    print(f"writing file {os.path.join('data', 'players.json')}")
    json.dump(player_dict, jsf, indent=2)