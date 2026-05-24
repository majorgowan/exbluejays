#!/bin/bash
echo "Starting weekly update..."
set -e

echo "Updating player status"
node ./scripts/update_status.js --verbose --skipStatus --skipRetired

echo "Updating player stats"
node ./scripts/update_stats.js --verbose

echo "Fetching news"
node ./scripts/fetch_news.js --verbose --cleanup

echo "Composing Mister Ex report"
node ./scripts/make_summary.js --verbose --yes

echo "All scripts executed."