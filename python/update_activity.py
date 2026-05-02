import os
import json
import time
import requests

base_url = "https://statsapi.mlb.com"

with open(os.path.join("data", "players.json"), "r") as jsf:
    player_dict = json.load(jsf)

for iplayer, (id, player) in enumerate(player_dict.items()):
    if (iplayer + 1) % 20 == 0:
        # pause to be nice
        time.sleep(2)
    print(f"updating {player} ({player['fullName']})", end=" ")
    # get active status
    player_link = player["link"]
    res = requests.get(f"{base_url}{player_link}")
    if res.status_code == 200:
        data = res.json()
        player_dict[id]["active"] = data["people"][0]["active"]
        if data["people"][0]["active"]:
            print("... is active, ", end=" ")
        else:
            print("... is not active, ", end=" ")
    else:
        print(f"error: {res.status_code}")
    # get years with Toronto
    res = requests.get(f"{base_url}{player_link}/stats",
                       params={"stats": "yearByYear"})
    if res.status_code == 200:
        data = res.json()
        if len(data["stats"]) > 0:
            # get only single-team lines (not cumulatives):
            splits = [split for split in data["stats"][0]["splits"]
                      if "team" in split]
            years_with_jays = [split["season"]
                               for split in splits
                               if "Toronto" in split["team"]["name"]]
            latest_team = splits[-1]["team"]["name"]
        else:
            years_with_jays = []
            latest_team = ""
        print(f"with Jays in {years_with_jays}, latest team {latest_team}")
        player_dict[id]["years_with_jays"] = years_with_jays
        player_dict[id]["latest_team"] = latest_team

    else:
        print(f"error: {res.status_code}")

with open(os.path.join("data", "players_with_activity.json"), "w") as jsf:
    json.dump(player_dict, jsf, indent=2)