# Gmail Energy Monitor

A Chrome extension that tracks your Gmail carbon footprint and energy consumption with real-time data analysis.

## Overview

Gmail Energy Monitor calculates the environmental impact of your email usage by analyzing your Gmail inbox. It provides insights into CO2 emissions, energy consumption, and offers personalized tips to reduce your digital carbon footprint.

## Features

- Real-time Gmail statistics (total emails, unread, sent, received, attachments)
- 24-hour hourly breakdown of activity
- Weekly trend visualization and cumulative tracking
- Real-world equivalents (phone charges, LED hours, car driving distance, tree absorption time)
- Personalized sustainability tips based on usage patterns
- CSV export for detailed reporting
- Transparent calculation formulas
- Automatic data cleanup (15-day retention)

## Installation & Setup

### Prerequisites

- Google Chrome browser
- Google Cloud Project with Gmail API enabled
- OAuth 2.0 credentials (Client ID)

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top and select "NEW PROJECT"
3. Enter project name: "Gmail Energy Monitor"
4. Click "CREATE"
5. Wait for the project to be created, then select it

### Step 2: Enable Gmail API

1. In the Cloud Console, search for "Gmail API" in the search bar ->
2. Click on "Gmail API" from the results
3. Click the "ENABLE" button
4. You should see "API enabled" confirmation

### Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials" in the left sidebar
2. Click "+ CREATE CREDENTIALS" at the top
3. Select "OAuth client ID"
4. need tpo set "CONFIGURE CONSENT SCREEN" first
   - Choose "External" user type
   - Click "CREATE"
   - Fill in the required fields:
   - Click "SAVE AND CONTINUE"
   - On the Scopes page, click "ADD OR REMOVE SCOPES"
   - Search for "Gmail API" and select "https://www.googleapis.com/auth/gmail.readonly"
   - Click "UPDATE" and then "SAVE AND CONTINUE"
   - Click "SAVE AND CONTINUE" on the remaining pages
5. Back in Credentials, click "+ CREATE CREDENTIALS" again
6. Select "OAuth client ID"
7. Choose "Chrome App" as the application type
8. Enter extension name: "Gmail Energy Monitor"
9. Click "CREATE"
10. Copy the Client ID from the modal that appears

### Step 4: Update Extension Credentials

1. Open the `manifest.json` file in the project
2. Find the `oauth2` section (around line ~ 18-19)
3. Replace the `client_id` value with your Client ID from Step 3:
4. Save the file

### Step 5: Load Extension in Chrome

## Data Storage

- Extension stores data locally in Chrome storage
- Data older than 15 days is automatically deleted
- Only read-only Gmail access is requested (no email modification)
- First login date is recorded for reference

## Privacy & Security

- All data is stored locally in your browser
- No data is sent to external servers
- Gmail API access is read-only
- No email content is stored or analyzed
- OAuth tokens are stored securely in Chrome storage
