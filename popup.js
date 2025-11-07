let usageChart = null;
let cumulativeChart = null;
let dailyBarChart = null;
let todayHourlyChart = null;
let accessToken = null;


// NORMALIZE SNAPSHOT -Ensures all snapshots have required fields even if incomplete !!just a precaution. as faced problem b4

function normalizeSnapshot(snapshot) {
  return {
    timestamp: snapshot.timestamp || Date.now(),
    totalEmails: snapshot.totalEmails || 0,
    sentEmails: snapshot.sentEmails || 0,
    receivedEmails: snapshot.receivedEmails || 0,
    unreadEmails: snapshot.unreadEmails || 0,
    attachments: snapshot.attachments || 0,
    totalSize: snapshot.totalSize || 0,
    emailSizes: snapshot.emailSizes || [],
    newEmails: snapshot.newEmails !== undefined ? snapshot.newEmails : 0,
    newEmailsDataMB: snapshot.newEmailsDataMB !== undefined ? snapshot.newEmailsDataMB : 0,
    attachmentSizeMB: snapshot.attachmentSizeMB !== undefined ? snapshot.attachmentSizeMB : 0
  };
}


// SHOW/HIDE SECTIONS

function showMainSection() {
  document.getElementById('loginSection').style.display = 'none';
  const main = document.getElementById('mainSection');
  main.style.display = 'block';
  main.style.opacity = '1';
}

function showLoginSection() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('mainSection').style.display = 'none';
}


// DOM INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
  // console.log('Gmail Energy Monitor starting...');
  
  const result = await chrome.storage.local.get(['accessToken', 'firstLoginDate', 'gmailData']);
  accessToken = result.accessToken;

  if (accessToken) {
    showMainSection();
    await updateAllStats();// Only load existing data from storage, NO fetch

  } else {
    showLoginSection();
  }
  setupEventListeners();
});


// EVENT LISTENERS

function setupEventListeners() {

  document.getElementById('loginBtn')?.addEventListener('click', handleLogin);

  //nav button color if active
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', e => {

      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

      e.target.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

      const view = document.getElementById(e.target.dataset.view);

      if (view) view.classList.add('active');
    });
  });

  document.getElementById('formulaBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const cumulativeSection = document.getElementById('cumulativeSection');
    if (cumulativeSection) cumulativeSection.style.display = 'none';
    const formulaTab = document.getElementById('formula');
    if (formulaTab) formulaTab.classList.add('active');
  });

  // Refresh button triggers fetch + update
  document.getElementById('refreshBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Refreshing...';
    btn.disabled = true;
    
    try {
      await fetchGmailData();
      await updateAllStats();

      btn.textContent = '✓ Refreshed';

      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error('Refresh error:', err);

      btn.textContent = '✗ Error';

      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('exportBtn')?.addEventListener('click', exportCSV);
}


// LOGIN HANDLER
async function handleLogin() {
  try {
    accessToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, token => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(token);
      });
    });

    const firstLoginDate = new Date().toISOString();
    await chrome.storage.local.set({
      accessToken,
      firstLoginDate,
      gmailData: { history: [], _version: 2 }
    });

    showMainSection();
    // / After first login, fetch initial data
    await fetchGmailData();
    await updateAllStats();
  } catch (err) {
    alert('Login failed: ' + err.message);
  }
}


// FETCH GMAIL DATA - ONLY ADD SNAPSHOT IF DATA CHANGED, ot every refresh
async function fetchGmailData() {
  const { accessToken: token, firstLoginDate, gmailData: prevData } = await chrome.storage.local.get(['accessToken', 'firstLoginDate', 'gmailData']);

  if (!token) {
    console.error('No access token found');
    return;
  }

  const firstLoginTime = firstLoginDate ? Math.floor(new Date(firstLoginDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

  const afterQuery = `after:${firstLoginTime} -label:trash`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    const messagesRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${afterQuery}&maxResults=500`,
      { headers }
    );
    
    //  401 token expiration Handling
    if (messagesRes.status === 401) {
      // console.log('Token expired, refreshing...');
      await chrome.storage.local.remove('accessToken');
      const newToken = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, token => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(token);
        });
      });
      await chrome.storage.local.set({ accessToken: newToken });
      headers.Authorization = `Bearer ${newToken}`;
      const retryRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages?q=${afterQuery}&maxResults=500`,
        { headers }
      );
      if (!retryRes.ok) {
        throw new Error(`Gmail API error: ${retryRes.status}`);
      }
    }
    
    if (!messagesRes.ok) {
      throw new Error(`Gmail API error: ${messagesRes.status}`);
    }
    
    const messagesData = await messagesRes.json();
    const messages = messagesData.messages || [];

    let totalSize = 0;
    const emailSizes = [];
    let sentEmails = 0;
    let receivedEmails = 0;
    let unreadEmails = 0;
    let attachmentCount = 0;
    let totalAttachmentSizeMB = 0;

    const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', { headers });
    const profile = await profileRes.json();
    const userEmail = profile.emailAddress.toLowerCase();

    for (const msg of messages) {
      try {
        const detailRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers }
        );
        const detail = await detailRes.json();

        const size = detail.sizeEstimate || 0;
        totalSize += size;
        emailSizes.push(size);

        const headers_list = detail.payload?.headers || [];
        const fromHeader = headers_list.find(h => h.name.toLowerCase() === 'from')?.value || '';
        const fromEmail = fromHeader.toLowerCase();
        
        const isSent = fromEmail.includes(userEmail) || detail.labelIds?.includes('SENT');
        const isUnread = detail.labelIds?.includes('UNREAD');

        let attachmentCount_thisEmail = 0;
        let attachmentSize_thisEmail = 0;
        
        function countAttachments(parts) {
          if (!parts) return { count: 0, size: 0 };
          let count = 0;
          let size = 0;
          for (const part of parts) {
            if (part.filename && part.filename.trim() !== '' && part.body?.attachmentId) {
              count++;
              size += (part.body?.size || 0) / (1024 * 1024);
            }
            if (part.parts) {
              const subResult = countAttachments(part.parts);
              count += subResult.count;
              size += subResult.size;
            }
          }
          return { count, size };
        }
        
        const attachmentResult = countAttachments(detail.payload?.parts);
        attachmentCount_thisEmail = attachmentResult.count;
        attachmentSize_thisEmail = attachmentResult.size;
        
        attachmentCount += attachmentCount_thisEmail;
        totalAttachmentSizeMB += attachmentSize_thisEmail;

        if (isSent) {
          sentEmails++;
        } else {
          receivedEmails++;
        }
        
        if (isUnread) unreadEmails++;

      } catch (e) { 
        console.error('Parse error for message:', msg.id, e); 
      }
    }

    const totalEmails = messages.length;

    // new snapshot creation
    const newSnapshot = {
      timestamp: Date.now(),
      totalEmails,
      sentEmails,
      receivedEmails,
      unreadEmails,
      attachments: attachmentCount,
      totalSize,
      emailSizes: emailSizes.length > 0 ? emailSizes : [0],
      newEmails: 0,
      newEmailsDataMB: 0,
      attachmentSizeMB: totalAttachmentSizeMB
    };

    const existingHistory = (prevData?.history || []);
    
    //ONLY ADD IF DATA CHANGED 
    if (existingHistory.length > 0) {
      const lastSnapshot = existingHistory[existingHistory.length - 1];
      
      // if data actually changed checking
      const emailsChanged = totalEmails !== lastSnapshot.totalEmails;
      const sizeChanged = totalSize !== lastSnapshot.totalSize;
      const attachmentsChanged = totalAttachmentSizeMB !== (lastSnapshot.attachmentSizeMB || 0);
      
      if (!emailsChanged && !sizeChanged && !attachmentsChanged) {
        // console.log('No data change - snapshot NOT added');
        return; // Exit - don't add
      }
      
      // console.log('Data changed - adding snapshot');
      newSnapshot.newEmails = Math.max(0, totalEmails - lastSnapshot.totalEmails);
      newSnapshot.newEmailsDataMB = Math.max(0, (totalSize - lastSnapshot.totalSize) / 1024 / 1024);
    } else {
      // console.log('First snapshot - adding');
      newSnapshot.newEmails = totalEmails;
      newSnapshot.newEmailsDataMB = totalSize / 1024 / 1024;
    }
    
    // Add to history
    existingHistory.push(newSnapshot);
    existingHistory.sort((a, b) => a.timestamp - b.timestamp);
    
    // Save
    await chrome.storage.local.set({
      gmailData: {
        ...newSnapshot,
        history: existingHistory,
        _version: 2
      }
    });
    
    // console.log(` Snapshots saved: ${existingHistory.length}`);

  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
}


// CALCULATION FUNCTION
function calculateEmissions(data) {
  const normalizedData = {
    newEmails: data.newEmails || 0,
    attachmentSizeMB: data.attachmentSizeMB || 0,
    totalSize: data.totalSize || 0,
    daysTracked: data.daysTracked || 1
  };
  
  //metrics against clculation will be done
  const CO2_PER_EMAIL_TRANSMISSION = 0.3;
  const CO2_PER_MB_ATTACHMENT = 4; 
  const CO2_PER_GB_STORAGE_ANNUAL = 30;
  const CARBON_INTENSITY_GLOBAL = 445; 

  const co2_transmission = normalizedData.newEmails * CO2_PER_EMAIL_TRANSMISSION;
  const co2_attachments = normalizedData.attachmentSizeMB * CO2_PER_MB_ATTACHMENT;
  
  const totalSizeGB = (normalizedData.totalSize / 1024 / 1024 / 1024) || 0;
  const daysTracked = normalizedData.daysTracked;
  const co2_storage = (totalSizeGB * CO2_PER_GB_STORAGE_ANNUAL) / 365 * daysTracked;
  
  const co2_total = co2_transmission + co2_attachments + co2_storage;
  const energy_kwh = co2_total / (CARBON_INTENSITY_GLOBAL * 1000);
  const energy_wh = energy_kwh * 1000;
  
  return {
    co2: parseFloat(co2_total.toFixed(2)),
    energy_wh: parseFloat(energy_wh.toFixed(2)),
    energy_kwh: parseFloat(energy_kwh.toFixed(6)),
    breakdown: {
      transmission: parseFloat(co2_transmission.toFixed(2)),
      attachments: parseFloat(co2_attachments.toFixed(2)),
      storage: parseFloat(co2_storage.toFixed(2))
    }
  };
}


// HELPER FUNCTIONS
function co2ToEnergyWh(co2Grams) {
  const CARBON_INTENSITY = 445;
  return co2Grams / CARBON_INTENSITY;
}

function co2ToEnergyKwh(co2Grams) {
  const CARBON_INTENSITY = 445;
  return (co2Grams / CARBON_INTENSITY) * 1000;
}

// FORMAT ENERGY UNITS (µWh, mWh, Wh, kWh)
function formatWh(wh) {
  if (wh < 0.001) return (wh * 1000000).toFixed(2) + " µWh";
  if (wh < 1) return (wh * 1000).toFixed(2) + " mWh";
  if (wh < 1000) return wh.toFixed(2) + " Wh";
  return (wh / 1000).toFixed(2) + " kWh";
}


// UPDATE ALL STATS

async function updateAllStats() {

  const { gmailData, firstLoginDate } = await chrome.storage.local.get(['gmailData', 'firstLoginDate']);

  const data = gmailData || { history: [], totalEmails: 0, sentEmails: 0, receivedEmails: 0, unreadEmails: 0, attachments: 0, totalSize: 0, emailSizes: [] };

  const getEl = id => document.getElementById(id);

  const latestSnapshot = data.history?.length > 0 ? normalizeSnapshot(data.history[data.history.length - 1]) : data;

  //KPI Grids value 
  const { co2 } = calculateEmissions(latestSnapshot);
  const days = data.history.length > 1 ? (Date.now() - data.history[0].timestamp) / 86400000 : 1;


  //aggregrate or not???? check line 597=601
  getEl('avgCO2Day') && (getEl('avgCO2Day').textContent = (co2 / Math.max(days, 1)).toFixed(1) + ' g');
  getEl('weeklyEnergy') &&
  (getEl('weeklyEnergy').textContent =
    formatWh(co2ToEnergyWh(co2 * 7 / Math.max(days, 1))));


  // === MAILBOX ===
    
  if (firstLoginDate) { //to show login date
    const d = new Date(firstLoginDate);
    document.getElementById('firstLoginDateMailbox').textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  const avgSize = latestSnapshot.emailSizes?.length ? (latestSnapshot.totalSize / latestSnapshot.emailSizes.length / 1024).toFixed(1) : 0;
  getEl('totalEmails') && (getEl('totalEmails').textContent = latestSnapshot.totalEmails || 0);
  getEl('unreadEmails') && (getEl('unreadEmails').textContent = latestSnapshot.unreadEmails || 0);
  getEl('sentEmails') && (getEl('sentEmails').textContent = latestSnapshot.sentEmails || 0);
  getEl('receivedEmails') && (getEl('receivedEmails').textContent = latestSnapshot.receivedEmails || 0);
  getEl('totalAttachments') && (getEl('totalAttachments').textContent = latestSnapshot.attachments || 0);
  getEl('avgEmailSize') && (getEl('avgEmailSize').textContent = avgSize + ' KB');
  getEl('totalData') && (getEl('totalData').textContent = (latestSnapshot.totalSize / 1024 / 1024).toFixed(2) + ' MB');

  if (latestSnapshot.emailSizes?.length) {
    const max = Math.max(...latestSnapshot.emailSizes) / 1024;
    const min = Math.min(...latestSnapshot.emailSizes) / 1024;
    getEl('largestEmail') && (getEl('largestEmail').textContent = max.toFixed(1) + ' KB');
    getEl('smallestEmail') && (getEl('smallestEmail').textContent = min.toFixed(1) + ' KB');
  }

  // === FIRST LOGIN ===
  if (firstLoginDate && getEl('firstLoginLabel')) {
    const d = new Date(firstLoginDate);
    getEl('firstLoginLabel').textContent = `First login: ${d.toLocaleDateString()} ${d.toLocaleTimeString()} (data older than 15 days auto-deleted)`;
  }

  // === CHARTS ===
  updateCharts(data);

  // === TODAY'S VIEW ===
  updateTodayView(data);

  // WEEKLY EQUIVALENTS
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const last7Days = (data.history || []).filter(h => h.timestamp >= sevenDaysAgo);

  let weeklyCO2 = 0;
  last7Days.forEach(snapshot => {
    const { co2: dayCO2 } = calculateEmissions(normalizeSnapshot(snapshot));
    weeklyCO2 += dayCO2;
  });

  if (weeklyCO2 === 0) weeklyCO2 = co2 * 7 / Math.max(days, 1);

  document.getElementById('equivPhone') && (document.getElementById('equivPhone').textContent = (weeklyCO2 / 8).toFixed(1) + ' charges');
  document.getElementById('equivLED') && (document.getElementById('equivLED').textContent = (weeklyCO2 / 4.45).toFixed(1) + ' hrs');
  document.getElementById('equivCar') && (document.getElementById('equivCar').textContent = (weeklyCO2 / 170).toFixed(0) + ' km');
  document.getElementById('equivTree') && (document.getElementById('equivTree').textContent = (weeklyCO2 / 0.046).toFixed(0) + ' min');

  // === TIPS ===
  const tipsEl = getEl('personalizedTips');
  if (tipsEl) {
    tipsEl.innerHTML = generatePersonalizedTips(latestSnapshot).map(t => `
      <div class="tip-card">
        <h3>${t.title}</h3>
        <p>${t.text}</p>
      </div>
    `).join('');
  }
}


// PERSONALIZED TIPS

function generatePersonalizedTips(data) {
  const tips = [];
  const totalSizeGB = (data.totalSize / 1024 / 1024 / 1024) || 0;
  const avgAttachmentSize = data.attachments > 0 
    ? data.attachmentSizeMB / data.attachments 
    : 0;

  if (totalSizeGB > 5) { //1st tip
    const annualCO2 = totalSizeGB * 30;
    tips.push({
      title: "Large Mailbox",
      text: `Your ${totalSizeGB.toFixed(1)}GB mailbox stores ~${annualCO2.toFixed(0)}g CO2 per year. Archive old emails to reduce carbon cost.`
    });
  }
  
  //2nd tip
  if (data.attachments > data.totalEmails * 0.1) {
    const ratio = Math.round((data.attachments / data.totalEmails) * 100);
    tips.push({
      title: "High Attachment Ratio",
      text: `${ratio}% of emails have attachments. Use cloud links to reduce impact by 80%.`
    });
  }
  
  if (avgAttachmentSize > 2) {//3 tip
    tips.push({
      title: "Compress Attachments",
      text: `Average attachment: ${avgAttachmentSize.toFixed(1)}MB. Compress before sending to reduce emissions.`
    });
  }

  // TIP 4
  if (data.sentEmails > data.receivedEmails * 0.5) {
    tips.push({
      title: "High Sending Volume",
      text: `You frequently send emails. Batch messages to reduce transmission overhead (0.3g CO2e per email).`
    });
  }
  
  if (tips.length === 0) { //default
    tips.push({
      title: "Good Job!",
      text: "Your email habits are efficient!"
    });
  }
  
  return tips;
}


// UPDATE CHARTS

function updateCharts(data) {

  const history = (data.history || []).sort((a, b) => a.timestamp - b.timestamp);
  
  if (history.length === 0) {
    console.log('No history data');
    return;
  }

  const normalizedHistory = history.map(normalizeSnapshot);
  const dailyActivity = {};

  normalizedHistory.forEach((snapshot, index) => {
    const dateKey = new Date(snapshot.timestamp).toLocaleDateString();
    
    if (!dailyActivity[dateKey]) {
      dailyActivity[dateKey] = {
        newEmails: 0,
        newDataMB: 0,
        attachmentSizeMB: 0,
        totalSize: snapshot.totalSize
      };
    }
    
    // Sum up all snapshots for this day
    dailyActivity[dateKey].newEmails += snapshot.newEmails || 0;
    dailyActivity[dateKey].newDataMB += snapshot.newEmailsDataMB || 0;
    dailyActivity[dateKey].attachmentSizeMB += snapshot.attachmentSizeMB || 0;
  });
  
  //to show dates even with no activity
  const startDate = new Date(history[0].timestamp);
  startDate.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const allDates = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    allDates.push(new Date(d).toLocaleDateString());
  }
  
  // Fill missing dates with zero activity
  allDates.forEach(dateKey => {
    if (!dailyActivity[dateKey]) {
      dailyActivity[dateKey] = {
        newEmails: 0,
        newDataMB: 0,
        attachmentSizeMB: 0,
        totalSize: 0
      };
    }
  });
  
  const labels = allDates; 


  const aggregatedData = labels.map(date => dailyActivity[date]);

  // Daily Bar Chart
  const ctxBar = document.getElementById('dailyBarChart')?.getContext('2d');
  if (ctxBar) {
    if (dailyBarChart) dailyBarChart.destroy();
    
    const dailyCO2 = aggregatedData.map(d => {
      const { co2 } = calculateEmissions({
        newEmails: d.newEmails,
        attachmentSizeMB: d.attachmentSizeMB,
        totalSize: d.totalSize,
        daysTracked: 1
      });
      return co2;
    });
    
    const dailyEnergy = dailyCO2.map(co2 => co2ToEnergyWh(co2));
    
    dailyBarChart = new Chart(ctxBar, {
      type: 'bar',
      data: { 
        labels, 
        datasets: [
          { label: 'CO₂ (g)', data: dailyCO2, backgroundColor: '#4CAF50' , yAxisID: 'y' }, //left
          { label: 'Energy (Wh)', data: dailyEnergy, backgroundColor: '#81C784', yAxisID: 'y1' }
        ]
      },
      options: { 
        responsive: true, 
        scales: {
          y: { title: { display: true, text: 'CO₂ (g)' }, position: 'left' },
          y1: { title: { display: true, text: 'Energy (Wh)' }, position: 'right', grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // Cumulative Chart
  const ctxCum = document.getElementById('cumulativeChart')?.getContext('2d');
  if (ctxCum) {
    if (cumulativeChart) cumulativeChart.destroy();
    
    const co2Data = aggregatedData.map(d => {
      const { co2 } = calculateEmissions({
        newEmails: d.newEmails,
        attachmentSizeMB: d.attachmentSizeMB,
        totalSize: d.totalSize,
        daysTracked: 1
      });
      return co2;
    });
    
    const energyData = co2Data.map(co2 => co2ToEnergyKwh(co2));
    
    cumulativeChart = new Chart(ctxCum, {
      type: 'line',
      data: { 
        labels, 
        datasets: [
          { label: 'CO₂ (g)', data: co2Data, borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.1)', fill: true, yAxisID: 'y' },
          { label: 'Energy (kWh)', data: energyData, borderColor: '#81C784', backgroundColor: 'rgba(129,199,132,0.1)', fill: true, yAxisID: 'y1' }
        ]
      },
      options: { 
        responsive: true, 
        scales: {
          y: { position: 'left', title: { display: true, text: 'CO₂ (g)' } },
          y1: { position: 'right', title: { display: true, text: 'Energy (kWh)' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }
}


// UPDATE TODAY'S VIEW
function updateTodayView(data) {
  const history = (data.history || []).sort((a, b) => a.timestamp - b.timestamp);
  
  if (history.length === 0) return;

  const today = new Date(); //midnight date set
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const todayEnd = todayStart + 86400000;

  const todaySnapshots = history
    .filter(h => h.timestamp >= todayStart && h.timestamp < todayEnd)
    .map(normalizeSnapshot);

  if (todaySnapshots.length === 0) {
    document.getElementById('todayEnergy').textContent = '0 Wh';
    document.getElementById('todayCO2').textContent = '0 g';
    document.getElementById('todayEmails').textContent = '0';
    document.getElementById('todayData').textContent = '0 MB';
    return;
  }

  let totalNewEmailsToday = 0;
  let totalNewDataToday = 0;
  let totalAttachmentSizeToday = 0;
  
  todaySnapshots.forEach(snapshot => {
    totalNewEmailsToday += snapshot.newEmails || 0;
    totalNewDataToday += snapshot.newEmailsDataMB || 0;
    totalAttachmentSizeToday += snapshot.attachmentSizeMB || 0;
  });

  const todayData = {
    newEmails: totalNewEmailsToday,
    attachmentSizeMB: totalAttachmentSizeToday,
    totalSize: totalNewDataToday * 1024 * 1024,
    daysTracked: 1
  };

  const { co2, energy_wh } = calculateEmissions(todayData);

  document.getElementById('todayEnergy').textContent = formatWh(energy_wh);

  document.getElementById('todayCO2').textContent = co2.toFixed(1) + ' g';
  document.getElementById('todayEmails').textContent = totalNewEmailsToday;
  document.getElementById('todayData').textContent = totalNewDataToday.toFixed(2) + ' MB';

  // Hourly buckets
  const hourlyBuckets = Array(24).fill(null).map((_, i) => ({
    hour: i,
    emails: 0,
    attachments: 0,
    totalSize: 0,
    co2: 0,
    energy: 0
  }));

  const hourlySnapshots = {};
  todaySnapshots.forEach(snapshot => {
    const hour = new Date(snapshot.timestamp).getHours();
    if (!hourlySnapshots[hour] || snapshot.timestamp > hourlySnapshots[hour].timestamp) {
      hourlySnapshots[hour] = snapshot;
    }
  });

  Object.entries(hourlySnapshots).forEach(([hour, snapshot]) => {
    const h = parseInt(hour);
    hourlyBuckets[h].emails = snapshot.totalEmails || 0;
    hourlyBuckets[h].attachments = snapshot.attachments || 0;
    hourlyBuckets[h].totalSize = snapshot.totalSize || 0;

    const { co2: hourlyCO2 } = calculateEmissions(snapshot);
    hourlyBuckets[h].co2 = hourlyCO2;
    hourlyBuckets[h].energy = co2ToEnergyWh(hourlyCO2);
  });

  const ctxHourly = document.getElementById('todayHourlyChart')?.getContext('2d');
  if (ctxHourly) {
    if (todayHourlyChart) todayHourlyChart.destroy();
    
    const currentHour = new Date().getHours();
    const filteredBuckets = hourlyBuckets.filter(h => h.hour <= currentHour);
    
    const labels = filteredBuckets.map(h => h.hour + ':00');
    const energyData = filteredBuckets.map(h => h.energy.toFixed(3));
    const co2Data = filteredBuckets.map(h => h.co2.toFixed(4));

    todayHourlyChart = new Chart(ctxHourly, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Energy (Wh)',
            data: energyData,
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76,175,80,0.1)',
            fill: true,
            tension: 0.4,
            yAxisID: 'y1'
          },
          {
            label: 'CO₂ (g)',
            data: co2Data,
            borderColor: '#FF6B6B',
            backgroundColor: 'rgba(255,107,107,0.1)',
            fill: true,
            tension: 0.4,
            yAxisID: 'y' //left
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          y: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Energy (Wh)' }
          },
          y1: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'CO₂ (g)' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }
}


// EXPORT CSV
function exportCSV() {
  chrome.storage.local.get(['gmailData'], res => {
    const data = res.gmailData;
    if (!data?.history?.length) return alert('No data to export.');

    let csv = 'Date,Time,New_Emails_Count,New_Data_MB,Attachment_MB,Total_Stored_GB,CO2_g,Energy_Wh,CO2_Transmission_g,CO2_Attachment_g,CO2_Storage_g\n';
    
    const normalizedHistory = data.history.map(normalizeSnapshot);
    
    normalizedHistory.forEach(h => {
      const { co2, energy_wh, breakdown } = calculateEmissions({
        newEmails: h.newEmails,
        attachmentSizeMB: h.attachmentSizeMB,
        totalSize: h.totalSize,
        daysTracked: 1
      });
      
      const date = new Date(h.timestamp);
      const totalGB = (h.totalSize / 1024 / 1024 / 1024).toFixed(2);
      const newDataMB = (h.newEmailsDataMB || 0).toFixed(2);
      const attachMB = (h.attachmentSizeMB || 0).toFixed(2);
      
      csv += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${h.newEmails || 0},${newDataMB},${attachMB},${totalGB},${co2.toFixed(2)},${energy_wh.toFixed(2)},${breakdown.transmission.toFixed(2)},${breakdown.attachments.toFixed(2)},${breakdown.storage.toFixed(2)}\n`;
    });

    // Add summary
    csv += '\n--- SUMMARY (2024-2025 Verified Metrics) ---\n';
    csv += 'Metric,Value\n';
    csv += `Carbon Intensity,445 g CO2/kWh\n`;
    csv += `Email Transmission,0.3g CO2e\n`;
    csv += `Attachment Data,4g per MB\n`;
    csv += `Storage Cost,30g per GB/year\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url,
      filename: `Gmail_Energy_Report_${new Date().toISOString().split('T')[0]}.csv`,
      saveAs: true
    });
  });
}
