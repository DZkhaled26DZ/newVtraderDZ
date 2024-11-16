// تكوين المتغيرات العامة
let chart = null;
let activeWebSocket = null;
const audioAlert = document.getElementById('alertSound');
const soundUrls = {
    notification1: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    notification2: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
    notification3: 'https://assets.mixkit.co/active_storage/sfx/2871/2871-preview.mp3'
};

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // إعداد أزرار التحكم
    document.getElementById('startAnalysis').addEventListener('click', startAnalysis);
    document.getElementById('stopAnalysis').addEventListener('click', stopAnalysis);
    document.getElementById('refreshData').addEventListener('click', refreshData);
    document.getElementById('closeChart').addEventListener('click', closeChart);

    // إعداد التحكم بالصوت
    document.getElementById('soundSelect').addEventListener('change', handleSoundChange);
    document.getElementById('volume').addEventListener('input', handleVolumeChange);
    document.getElementById('customSound').addEventListener('change', handleCustomSound);
    
    // تحميل الإعدادات المحفوظة
    loadSettings();
});

// حفظ الإعدادات
function saveSettings() {
    const settings = {
        enableLowerWick: document.getElementById('enableLowerWick').checked,
        enableUpperWick: document.getElementById('enableUpperWick').checked,
        lowerWickValue: document.getElementById('lowerWick').value,
        upperWickValue: document.getElementById('upperWick').value,
        enableSound: document.getElementById('enableSound').checked,
        selectedSound: document.getElementById('soundSelect').value,
        volume: document.getElementById('volume').value
    };
    localStorage.setItem('cryptoAnalyzerSettings', JSON.stringify(settings));
}

// تحميل الإعدادات
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('cryptoAnalyzerSettings'));
    if (settings) {
        document.getElementById('enableLowerWick').checked = settings.enableLowerWick;
        document.getElementById('enableUpperWick').checked = settings.enableUpperWick;
        document.getElementById('lowerWick').value = settings.lowerWickValue;
        document.getElementById('upperWick').value = settings.upperWickValue;
        document.getElementById('enableSound').checked = settings.enableSound;
        document.getElementById('soundSelect').value = settings.selectedSound;
        document.getElementById('volume').value = settings.volume;
        handleVolumeChange();
    }
}

// التحكم بالصوت
function handleSoundChange(event) {
    if (event.target.value === 'custom') {
        document.getElementById('customSound').click();
    } else {
        audioAlert.src = soundUrls[event.target.value];
    }
    saveSettings();
}

function handleVolumeChange() {
    const volume = document.getElementById('volume').value;
    audioAlert.volume = volume / 100;
    saveSettings();
}

function handleCustomSound(event) {
    const file = event.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        audioAlert.src = url;
        saveSettings();
    }
}

// دالة بدء التحليل
async function startAnalysis() {
    const enableLowerWick = document.getElementById('enableLowerWick').checked;
    const enableUpperWick = document.getElementById('enableUpperWick').checked;
    const lowerWickPercentage = parseFloat(document.getElementById('lowerWick').value);
    const upperWickPercentage = parseFloat(document.getElementById('upperWick').value);

    if (!enableLowerWick && !enableUpperWick) {
        showNotification('يرجى تفعيل تحليل الذيل العلوي أو السفلي على الأقل', 'error');
        return;
    }

    if ((enableLowerWick && isNaN(lowerWickPercentage)) || (enableUpperWick && isNaN(upperWickPercentage))) {
        showNotification('يرجى إدخال قيم صحيحة للذيول', 'error');
        return;
    }

    // تحديث حالة الأزرار
    document.getElementById('startAnalysis').disabled = true;
    document.getElementById('stopAnalysis').disabled = false;

    // إغلاق WebSocket السابق إذا كان موجوداً
    if (activeWebSocket) {
        activeWebSocket.close();
    }

    try {
        const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        const data = await response.json();
        const symbols = data.symbols
            .filter(symbol => symbol.status === 'TRADING' && symbol.quoteAsset === 'USDT')
            .map(symbol => symbol.symbol);

        startWebSocket(symbols, {
            enableLowerWick,
            enableUpperWick,
            lowerWickPercentage,
            upperWickPercentage
        });
    } catch (error) {
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        console.error('Error fetching symbols:', error);
    }
}

// دالة إيقاف التحليل
function stopAnalysis() {
    if (activeWebSocket) {
        activeWebSocket.close();
        activeWebSocket = null;
    }
    document.getElementById('startAnalysis').disabled = false;
    document.getElementById('stopAnalysis').disabled = true;
    showNotification('تم إيقاف التحليل', 'info');
}

// دالة تحديث البيانات
function refreshData() {
    if (activeWebSocket) {
        activeWebSocket.close();
        startAnalysis();
        showNotification('جاري تحديث البيانات...', 'info');
    }
}

// دالة بدء اتصال WebSocket
function startWebSocket(symbols, config) {
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbols.map(s => s.toLowerCase() + '@kline_1h').join('/')}`;
    activeWebSocket = new WebSocket(wsUrl);

    activeWebSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.e === 'kline') {
            analyzeCandle(data.s, data.k, config);
        }
    };

    activeWebSocket.onerror = (error) => {
        showNotification('حدث خطأ في اتصال WebSocket', 'error');
        console.error('WebSocket error:', error);
    };
}

// دالة تحليل الشمعة
function analyzeCandle(symbol, kline, config) {
    const open = parseFloat(kline.o);
    const high = parseFloat(kline.h);
    const low = parseFloat(kline.l);
    const close = parseFloat(kline.c);
    const volume = parseFloat(kline.v);

    const bodyHeight = Math.abs(close - open);
    const totalHeight = high - low;
    
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    
    const upperWickRatio = (upperWick / totalHeight) * 100;
    const lowerWickRatio = (lowerWick / totalHeight) * 100;

    if (config.enableUpperWick && upperWickRatio >= config.upperWickPercentage) {
        addToTable(symbol, close, 'بيع', volume, upperWickRatio.toFixed(2));
        showNotification(`🔔 إشارة بيع: ${symbol}`, 'sell');
        playAlert();
    } else if (config.enableLowerWick && lowerWickRatio >= config.lowerWickPercentage) {
        addToTable(symbol, close, 'شراء', volume, lowerWickRatio.toFixed(2));
        showNotification(`🔔 إشارة شراء: ${symbol}`, 'buy');
        playAlert();
    }
}

// دالة إضافة العملة إلى الجدول المناسب
function addToTable(symbol, price, signal, volume, wickRatio) {
    const table = price < 1 ? document.getElementById('lowPriceTable') : document.getElementById('highPriceTable');
    const tbody = table.querySelector('tbody');
    
    let row = Array.from(tbody.rows).find(row => row.cells[0].textContent === symbol);
    
    if (!row) {
        row = tbody.insertRow();
        row.innerHTML = `
            <td>${symbol}</td>
            <td class="price">$${price.toFixed(8)}</td>
            <td class="change">-</td>
            <td>${formatVolume(volume)}</td>
            <td class="signal ${signal === 'شراء' ? 'buy' : 'sell'}">${signal}</td>
            <td>
                <button class="btn-secondary" onclick="showChart('${symbol}')">
                    <i class="fas fa-chart-line"></i>
                </button>
            </td>
        `;
    } else {
        row.cells[1].textContent = `$${price.toFixed(8)}`;
        row.cells[3].textContent = formatVolume(volume);
        row.cells[4].className = `signal ${signal === 'شراء' ? 'buy' : 'sell'}`;
        row.cells[4].textContent = signal;
    }
}

// دالة عرض الرسم البياني
async function showChart(symbol) {
    document.getElementById('chartSection').classList.remove('hidden');
    
    try {
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`);
        const data = await response.json();
        
        const chartData = data.map(d => ({
            x: new Date(d[0]),
            y: [parseFloat(d[1]), parseFloat(d[2]), parseFloat(d[3]), parseFloat(d[4])]
        }));

        if (chart) {
            chart.destroy();
        }

        const ctx = document.getElementById('priceChart').getContext('2d');
        chart = new Chart(ctx, {
            type: 'candlestick',
            data: {
                datasets: [{
                    label: symbol,
                    data: chartData
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    } catch (error) {
        showNotification('حدث خطأ في تحميل بيانات الرسم البياني', 'error');
        console.error('Error fetching chart data:', error);
    }
}

// دالة إغلاق الرسم البياني
function closeChart() {
    document.getElementById('chartSection').classList.add('hidden');
    if (chart) {
        chart.destroy();
        chart = null;
    }
}

// دالة تنسيق حجم التداول
function formatVolume(volume) {
    if (volume >= 1000000) {
        return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
        return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toFixed(2);
}

// دالة عرض الإشعارات
function showNotification(message, type) {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notifications.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// دالة تشغيل صوت التنبيه
function playAlert() {
    if (document.getElementById('enableSound').checked) {
        audioAlert.play().catch(error => console.error('Error playing alert sound:', error));
    }
}