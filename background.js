// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Gmail Energy Monitor installed');
  
  // Set up alarm for automatic data refresh
  // chrome.alarms.create('auto-refresh', { periodInMinutes: 30 });
  
  // Set up alarm for data cleanup
  chrome.alarms.create('cleanup-old-data', { periodInMinutes: 1440 }); // Daily
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // if (alarm.name === 'auto-refresh') {
  //   await autoRefreshGmailData();
  // } else if (alarm.name === 'cleanup-old-data') {
  //   await cleanupOldData();
  // }
  if (alarm.name === 'cleanup-old-data') {
    await cleanupOldData();
  }
});

// async function autoRefreshGmailData() {
//   const result = await chrome.storage.local.get('accessToken');
//   if (!result.accessToken) return;

//   try {
//     const headers = {
//       'Authorization': `Bearer ${result.accessToken}`,
//       'Content-Type': 'application/json'
//     };

//     // Fetch profile
//     const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', { headers });
//     const profile = await profileRes.json();

//     if (profile.error) {
//       // Token may be invalid
//       await chrome.storage.local.remove('accessToken');
//       return;
//     }

//     // Fetch recent messages
//     const messagesRes = await fetch(
//       'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=100',
//       { headers }
//     );
//     const messagesData = await messagesRes.json();
//     const messages = messagesData.messages || [];

//     let totalSize = 0;
//     let attachmentCount = 0;
//     const emailSizes = [];
//     let sentCount = 0;

//     // Fetch sent count
//     const sentRes = await fetch(
//       'https://www.googleapis.com/gmail/v1/users/me/messages?q=from%3Ame&maxResults=1',
//       { headers }
//     );
//     const sentData = await sentRes.json();
//     sentCount = sentData.resultSizeEstimate || 0;

//     // Process messages
//     for (const msg of messages.slice(0, 50)) {
//       const detailRes = await fetch(
//         `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
//         { headers }
//       );
//       const detail = await detailRes.json();
      
//       const size = detail.sizeEstimate || 0;
//       totalSize += size;
//       emailSizes.push(size);

//       if (detail.payload?.parts) {
//         const hasAttachment = detail.payload.parts.some(part => part.filename);
//         if (hasAttachment) attachmentCount++;
//       }
//     }

//     const receivedCount = profile.messagesTotal - sentCount;

//     const gmailData = {
//       timestamp: Date.now(),
//       totalEmails: profile.messagesTotal || 0,
//       unreadEmails: profile.messagesUnread || 0,
//       sentEmails: sentCount,
//       receivedEmails: receivedCount,
//       attachments: attachmentCount,
//       totalSize: totalSize,
//       emailSizes: emailSizes
//     };

//     // Store data and add to history
//     const stored = await chrome.storage.local.get('gmailData');
//     const prevData = stored.gmailData || {};
//     prevData.history = prevData.history || [];
//     prevData.history.push({
//       timestamp: Date.now(),
//       ...gmailData
//     });

//     Object.assign(prevData, gmailData);
//     await chrome.storage.local.set({ gmailData: prevData });

//   } catch (err) {
//     console.error('Auto-refresh error:', err);
//   }
// }

async function cleanupOldData() {
  try {
    const result = await chrome.storage.local.get('gmailData');
    const gmailData = result.gmailData || {};

    if (!gmailData.history) return;

    const fifteenDaysAgo = Date.now() - (15 * 24 * 60 * 60 * 1000);
    gmailData.history = gmailData.history.filter(h => h.timestamp > fifteenDaysAgo);

    await chrome.storage.local.set({ gmailData });
    console.log('Cleaned up old data');
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshData') {
    sendResponse({ status: 'refreshed' });
    // autoRefreshGmailData().then(() => {
    //   sendResponse({ status: 'refreshed' });
    // });
  }
});