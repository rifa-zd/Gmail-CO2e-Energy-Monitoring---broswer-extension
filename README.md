# Gmail Energy Monitoring

A Chrome extension that tracks your Gmail carbon footprint and energy consumption with real-time data analysis.

## Overview

Gmail Energy Monitor calculates the environmental impact of email usage by analyzing Gmail inbox. It provides insights into CO2 emissions, energy consumption, and offers personalized tips to reduce digital carbon footprint.

## Features

- Real-time Gmail statistics (total emails, unread, sent, received, attachments) from teh log in date.
- 24-hour hourly breakdown of activity
- Weekly trend visualization and cumulative tracking
- Real-world equivalents (phone charges, LED hours, car driving distance, tree absorption time)
- Personalized sustainability tips based on usage patterns
- CSV export & Transparent calculation formulas
- Automatic data cleanup (15-day retention) to sustain chrome storage

## Installation & Setup

### Prerequisites

- Google Chrome browser
- Google Cloud Project with Gmail API enabled
- OAuth 2.0 credentials (Client ID)

### Step 1: Create a Google Cloud Project

### Step 2: Enable Gmail API

### Step 3: Create OAuth 2.0 Credentials
- in credentials, extension section for `Item ID` provide a random 32 character string for now (will get after uploading file in chrome extension)

### Step 4: Update Extension Credentials
1. In `manifest.json` (around line ~ 18-19) in `oauth2` - Replace the `client_id` value with Client ID from Step 3
4. Save the file

### Step 5: Load Extension in Chrome (developer Mode)
- Copy the ID from the folder `Details` section (a 32 character string) paste in Credentials `Item ID` (must)


## Data Storage

- Extension stores data locally in Chrome storage (Extension) 
- Data older than 15 days is automatically deleted
  
## Privacy & Security

- All data is stored locally in your browser
- No data is sent to external servers
- Gmail API access is read-only
- No email content is stored or analyzed
- OAuth tokens are stored securely in Chrome storage
