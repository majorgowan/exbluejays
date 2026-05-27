#!/bin/bash

# Get day of week as number (1=Monday, 7=Sunday)
day_num=$(date +%u)

if [ "$day_num" -ne "$1" ]; then
  exit 0
fi

echo "Starting weekly update..."
set -e

echo "Updating player status"
node ./scripts/update_status.js --verbose --skipStatus --skipRetired

echo "Updating player stats"
node ./scripts/update_stats.js --verbose

echo "Fetching news"
node ./scripts/fetch_news.js --verbose

echo "Evaluating news"
node ./scripts/evaluate_news.js --verbose

echo "Composing Mister Ex report"
node ./scripts/make_summary.js --verbose --yes

echo "Sending quality-control email to the Boss"
node scripts/send_emails.js --verbose --destination=mark.fruman@yahoo.com

echo "All scripts executed."