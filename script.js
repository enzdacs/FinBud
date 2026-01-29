// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, query, where, getDocs, deleteDoc, doc, orderBy, Timestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase config - Replace with your Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyBCxsjevklcDPAKf7wzQSnibv1WD6knTXk",
    authDomain: "finbud-1b068.firebaseapp.com",
    projectId: "finbud-1b068",
    storageBucket: "finbud-1b068.firebasestorage.app",
    messagingSenderId: "1002081121455",
    appId: "1:1002081121455:web:837c95b4b9b2b412c1d05a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper function for date formatting
// Get date string in YYYY-MM-DD format for Philippines timezone
function getPhilippinesDateString(date) {
    const philippinesDateStr = date.toLocaleString('en-US', { 
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const [month, day, year] = philippinesDateStr.split('/');
    return `${year}-${month}-${day}`;
}

// Global variables
let currentUser = null;
let expenses = [];
// Initialize currentDate using Philippines timezone (UTC+8)
const philippinesDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
let currentDate = getPhilippinesDateString(philippinesDate);
let currentCurrencyFilter = 'PHP';
let map = null;
let dailyBudgets = {}; // Object to store budgets by date: { 'YYYY-MM-DD': { amount, currency, name } }
let currentExpenseId = null;

// DOM Elements
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const showSignupLink = document.getElementById('showSignup');
const showLoginLink = document.getElementById('showLogin');
const logoutBtn = document.getElementById('logoutBtn');
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const closeSidebar = document.getElementById('closeSidebar');
const themeToggle = document.getElementById('themeToggle');
const addExpenseBtn = document.getElementById('addExpenseBtn');
const expenseModal = document.getElementById('expenseModal');
const expenseForm = document.getElementById('expenseForm');
const dateSelector = document.getElementById('dateSelector');
const exportPdfBtn = document.getElementById('exportPdfBtn');

// Category icons/emojis
const categoryIcons = {
    food: '🍔',
    transport: '🚗',
    shopping: '🛍️',
    bills: '💡',
    entertainment: '🎬',
    health: '💊',
    education: '📚',
    other: '📦'
};

// Helper Functions
function formatNumber(number, decimals = 2) {
    return parseFloat(number).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function getCurrencySymbol(currency) {
    const symbols = {
        'PHP': '₱',
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'JPY': '¥',
        'KRW': '₩',
        'SGD': 'S$',
        'CNY': '¥'
    };
    return symbols[currency] || currency;
}

// Helper function to measure text width
function getTextWidth(text, font) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = font;
    return context.measureText(text).width;
}

// Core formatting function that formats based on available width
function formatDynamicNumber(number, containerElement, font, symbolWidth = 0) {
    const num = parseFloat(number);
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    // Get container width - use a more appropriate default based on viewport
    // For desktop (above 480px), be generous with the default since containers are wide
    // For mobile (480px and below), use a more conservative estimate
    let defaultWidth;
    if (window.innerWidth <= 480) {
        defaultWidth = 250;
    } else if (window.innerWidth <= 768) {
        defaultWidth = 300;
    } else {
        // Desktop - assume plenty of space available
        defaultWidth = 400;
    }
    
    const containerWidth = containerElement ? containerElement.offsetWidth : defaultWidth;
    const maxWidth = containerWidth - symbolWidth - 20; // Account for padding and symbol
    
    // Full number with formatting
    const fullNumber = num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    // Check if full number fits
    const textWidth = getTextWidth(fullNumber, font);
    
    // If it fits, return full number
    if (textWidth <= maxWidth) {
        return fullNumber;
    }
    
    // Otherwise, use compact formatting
    if (absNum >= 1000000000000) {
        return sign + (absNum / 1000000000000).toFixed(2) + 'T';
    } else if (absNum >= 1000000000) {
        return sign + (absNum / 1000000000).toFixed(2) + 'B';
    } else if (absNum >= 1000000) {
        return sign + (absNum / 1000000).toFixed(2) + 'M';
    } else if (absNum >= 1000) {
        return sign + (absNum / 1000).toFixed(2) + 'k';
    }
    
    return fullNumber;
}

// Dynamic formatting for summary cards (Total Expenses, Remaining Budget)
function formatCompactNumber(number, containerElement = null) {
    const font = '700 32px Outfit, sans-serif';
    return formatDynamicNumber(number, containerElement, font, 30);
}

// Dynamic formatting for budget card - measures and formats only when needed
function formatBudgetAmount(number, containerElement = null) {
    const font = '700 32px Outfit, sans-serif';
    return formatDynamicNumber(number, containerElement, font, 30);
}

// Dynamic formatting for expense amounts - formats only when text would overflow
function formatExpenseAmount(number, containerElement = null) {
    // Use correct font size based on screen width
    const isMobile = window.innerWidth <= 480;
    const font = isMobile ? '700 16px Outfit, sans-serif' : '700 18px Outfit, sans-serif';
    return formatDynamicNumber(number, containerElement, font, 20);
}

// Convert amount between currencies (synchronous version for PDF)
function convertAmountSync(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    
    // If exchange rates not loaded, return original amount
    if (Object.keys(exchangeRates).length === 0) {
        return amount;
    }
    
    let result;
    if (fromCurrency === baseCurrency) {
        result = amount * exchangeRates[toCurrency];
    } else if (toCurrency === baseCurrency) {
        result = amount / exchangeRates[fromCurrency];
    } else {
        const amountInBase = amount / exchangeRates[fromCurrency];
        result = amountInBase * exchangeRates[toCurrency];
    }
    
    return result;
}

// Convert amount between currencies
async function convertAmount(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    
    // Ensure exchange rates are loaded
    if (Object.keys(exchangeRates).length === 0) {
        await fetchExchangeRates();
    }
    
    let result;
    if (fromCurrency === baseCurrency) {
        result = amount * exchangeRates[toCurrency];
    } else if (toCurrency === baseCurrency) {
        result = amount / exchangeRates[fromCurrency];
    } else {
        const amountInBase = amount / exchangeRates[fromCurrency];
        result = amountInBase * exchangeRates[toCurrency];
    }
    
    return result;
}

// Auth state observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authContainer.style.display = 'none';
        appContainer.style.display = 'flex';
        // Just store user info, button is now icon-only
        document.getElementById('userGreeting').setAttribute('data-username', user.displayName || user.email);
        
        // Set date selector to today's Philippines date
        dateSelector.value = currentDate;
        
        // Load daily budgets from Firebase (now async)
        await loadDailyBudgets();
        
        // Update budget display and load expenses
        updateBudgetDisplay();
        loadExpenses();
    } else {
        currentUser = null;
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

// Toggle between login and signup forms
showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.style.display = 'none';
    loginForm.style.display = 'block';
});

// Signup
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;

    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        showToast('Account created successfully!', 'success');
    } catch (error) {
        console.error('Signup error:', error);
        // Provide user-friendly error messages
        let errorMessage = 'Signup failed. Please try again.';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please sign in or use a different email.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format. Please check your email.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Please use at least 6 characters.';
        } else if (error.code === 'auth/operation-not-allowed') {
            errorMessage = 'Email/password accounts are not enabled. Please contact support.';
        }
        
        showToast(errorMessage, 'error');
    }
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Welcome back!', 'success');
    } catch (error) {
        console.error('Login error:', error);
        // Provide user-friendly error messages
        let errorMessage = 'Login failed. Please try again.';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'Email not found in database. Please check your email or sign up.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format. Please check your email.';
        } else if (error.code === 'auth/user-disabled') {
            errorMessage = 'This account has been disabled.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Invalid email or password. Please check your credentials.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts. Please try again later.';
        }
        
        showToast(errorMessage, 'error');
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    const confirmLogout = confirm('Are you sure you want to logout?');
    if (!confirmLogout) {
        return;
    }
    
    try {
        await signOut(auth);
        showToast('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to logout. Please try again.', 'error');
    }
});

// Sidebar toggle
menuToggle.addEventListener('click', () => {
    sidebar.classList.add('active');
    showOverlay();
});

closeSidebar.addEventListener('click', () => {
    sidebar.classList.remove('active');
    hideOverlay();
});

// Sidebar overlay
function showOverlay() {
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            hideOverlay();
        });
    }
    overlay.classList.add('active');
}

function hideOverlay() {
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Theme toggle
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.checked = savedTheme === 'dark';

themeToggle.addEventListener('change', () => {
    const theme = themeToggle.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
});

// Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = link.dataset.tab;
        switchTab(tabName);
        sidebar.classList.remove('active');
        hideOverlay();
    });
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    const tab = document.getElementById(tabName + 'Tab');
    if (tab) {
        tab.classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById('headerTitle').textContent = 
            tabName.charAt(0).toUpperCase() + tabName.slice(1).replace('-', ' ');
    }

    // Initialize map if switching to map tab
    if (tabName === 'map') {
        setTimeout(() => {
            if (!map) {
                initMap();
            } else {
                map.invalidateSize();
            }
        }, 100);
    }
}

// Add Expense Modal
addExpenseBtn.addEventListener('click', () => {
    expenseModal.classList.add('active');
    // Set current date and time in Philippines timezone (UTC+8)
    const now = new Date();
    const philippinesTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const year = philippinesTime.getFullYear();
    const month = String(philippinesTime.getMonth() + 1).padStart(2, '0');
    const day = String(philippinesTime.getDate()).padStart(2, '0');
    const hours = String(philippinesTime.getHours()).padStart(2, '0');
    const minutes = String(philippinesTime.getMinutes()).padStart(2, '0');
    const localISOTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    document.getElementById('expenseDate').value = localISOTime;
});

document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        expenseModal.classList.remove('active');
        expenseForm.reset();
    });
});

expenseModal.addEventListener('click', (e) => {
    if (e.target === expenseModal) {
        expenseModal.classList.remove('active');
        expenseForm.reset();
    }
});

// Add Expense
expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const expenseName = document.getElementById('expenseName').value;
    const expense = {
        name: expenseName,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        currency: document.getElementById('expenseCurrency').value,
        category: document.getElementById('expenseCategory').value,
        date: Timestamp.fromDate(new Date(document.getElementById('expenseDate').value)),
        notes: document.getElementById('expenseNotes').value,
        userId: currentUser.uid,
        createdAt: Timestamp.now()
    };

    try {
        await addDoc(collection(db, 'expenses'), expense);
        showToast(`Expense "${expenseName}" added successfully!`, 'success');
        expenseModal.classList.remove('active');
        expenseForm.reset();
        loadExpenses();
    } catch (error) {
        console.error('Error adding expense:', error);
        showToast('Failed to add expense. Please try again.', 'error');
    }
});

// Load Expenses
async function loadExpenses() {
    try {
        const q = query(
            collection(db, 'expenses'),
            where('userId', '==', currentUser.uid),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        expenses = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        filterAndDisplayExpenses();
    } catch (error) {
        console.error('Error loading expenses:', error);
        showToast('Error loading expenses', 'error');
    }
}

// Date selector handler
dateSelector.addEventListener('change', () => {
    currentDate = dateSelector.value;
    updateBudgetDisplay();
    filterAndDisplayExpenses();
});

// Currency filter
const currencyFilter = document.getElementById('currencyFilter');
currencyFilter.addEventListener('change', async () => {
    currentCurrencyFilter = currencyFilter.value;
    await updateBudgetDisplay();
    await filterAndDisplayExpenses();
});

async function filterAndDisplayExpenses() {
    // Filter expenses for the selected date
    // Convert expense dates to Philippines timezone for accurate comparison
    const filteredExpenses = expenses.filter(expense => {
        const expenseDate = expense.date.toDate();
        const expenseDateStr = getPhilippinesDateString(expenseDate);
        return expenseDateStr === currentDate;
    });

    await displayExpenses(filteredExpenses);
    await updateSummary(filteredExpenses);
    
    // Update current period display with selected date
    const dateObj = new Date(currentDate);
    document.getElementById('currentPeriod').textContent = dateObj.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

async function displayExpenses(expensesToDisplay) {
    const expensesList = document.getElementById('expensesList');
    
    if (expensesToDisplay.length === 0) {
        expensesList.innerHTML = '<p class="empty-state">No expenses for this period.</p>';
        return;
    }

    // Process expenses asynchronously for currency conversion
    const expenseItems = await Promise.all(expensesToDisplay.map(async expense => {
        const currency = expense.currency || 'PHP';
        let displayAmount = expense.amount;
        let displayCurrency = currency;
        
        // Convert currency if filter is not native
        if (currentCurrencyFilter !== 'native' && currency !== currentCurrencyFilter) {
            displayAmount = await convertAmount(expense.amount, currency, currentCurrencyFilter);
            displayCurrency = currentCurrencyFilter;
        }
        
        const symbol = getCurrencySymbol(displayCurrency);
        const displayedAmount = symbol + formatExpenseAmount(displayAmount);
        
        return `
        <div class="expense-item" onclick="viewExpense('${expense.id}')">
            <div class="expense-icon ${expense.category}">
                ${categoryIcons[expense.category]}
            </div>
            <div class="expense-details">
                <div class="expense-name">${expense.name}</div>
                <div class="expense-meta">
                    ${expense.category.charAt(0).toUpperCase() + expense.category.slice(1)} • 
                    ${expense.date.toDate().toLocaleDateString()}
                </div>
            </div>
            <div class="expense-amount" data-amount="${displayAmount}" data-symbol="${symbol}">${displayedAmount}</div>
            <div class="expense-actions">
                <button class="expense-edit" onclick="event.stopPropagation(); editExpense('${expense.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="expense-delete" onclick="event.stopPropagation(); deleteExpense('${expense.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
    }));
    
    expensesList.innerHTML = expenseItems.join('');
    
    // After rendering, update expense amounts with proper dynamic formatting
    updateExpenseAmounts();
}

// Function to update expense amount displays dynamically
function updateExpenseAmounts() {
    const expenseAmounts = document.querySelectorAll('.expense-amount[data-amount]');
    expenseAmounts.forEach(amountEl => {
        const amount = parseFloat(amountEl.dataset.amount);
        const symbol = amountEl.dataset.symbol;
        if (!isNaN(amount)) {
            amountEl.textContent = symbol + formatExpenseAmount(amount, amountEl);
        }
    });
}

async function updateSummary(expensesToDisplay) {
    // Ensure exchange rates are loaded
    if (Object.keys(exchangeRates).length === 0) {
        await fetchExchangeRates();
    }
    
    // Determine display currency from filter
    const displayCurrency = currentCurrencyFilter === 'native' ? 'PHP' : currentCurrencyFilter;
    const displaySymbol = getCurrencySymbol(displayCurrency);
    
    // Calculate total in display currency
    let totalInDisplayCurrency = 0;
    
    for (const expense of expensesToDisplay) {
        const currency = expense.currency || 'PHP';
        let amountInDisplayCurrency;
        
        if (currency === displayCurrency) {
            amountInDisplayCurrency = expense.amount;
        } else {
            amountInDisplayCurrency = await convertAmount(expense.amount, currency, displayCurrency);
        }
        
        totalInDisplayCurrency += amountInDisplayCurrency;
    }
    
    const totalExpensesEl = document.getElementById('totalExpenses');
    totalExpensesEl.textContent = displaySymbol + formatCompactNumber(totalInDisplayCurrency, totalExpensesEl);
    
    // Get budget for current date
    const currentBudget = dailyBudgets[currentDate];
    
    // Update remaining budget and status
    if (currentBudget && currentBudget.amount > 0) {
        let budgetInDisplayCurrency;
        
        if (currentBudget.currency === displayCurrency) {
            budgetInDisplayCurrency = currentBudget.amount;
        } else {
            budgetInDisplayCurrency = await convertAmount(currentBudget.amount, currentBudget.currency, displayCurrency);
        }
        
        const remaining = budgetInDisplayCurrency - totalInDisplayCurrency;
        const remainingEl = document.getElementById('remainingBudget');
        remainingEl.textContent = displaySymbol + formatCompactNumber(remaining, remainingEl);
        
        // Calculate budget percentage remaining
        const percentageRemaining = (remaining / budgetInDisplayCurrency) * 100;
        
        // Update budget status message
        const statusElement = document.getElementById('budgetStatus');
        let statusMessage = '';
        let statusColor = '';
        
        if (percentageRemaining <= 1) {
            statusMessage = 'no more budget';
            statusColor = '#ef4444'; // Red
        } else if (percentageRemaining <= 25) {
            statusMessage = 'be thrifty';
            statusColor = '#f59e0b'; // Orange
        } else if (percentageRemaining <= 50) {
            statusMessage = 'half';
            statusColor = '#eab308'; // Yellow
        } else if (percentageRemaining <= 75) {
            statusMessage = 'still good';
            statusColor = '#10b981'; // Green
        } else {
            statusMessage = 'full';
            statusColor = '#10b981'; // Green
        }
        
        statusElement.textContent = statusMessage;
        statusElement.style.color = statusColor;
        
        // Change remaining amount color
        const remainingElement = document.getElementById('remainingBudget');
        remainingElement.style.color = statusColor;
    } else {
        document.getElementById('remainingBudget').textContent = displaySymbol + '0.00';
        document.getElementById('budgetStatus').textContent = '';
    }
}

// Delete Expense
window.deleteExpense = async function(expenseId) {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
        await deleteDoc(doc(db, 'expenses', expenseId));
        showToast('Expense deleted successfully!', 'success');
        loadExpenses();
    } catch (error) {
        console.error('Error deleting expense:', error);
        showToast('Failed to delete expense. Please try again.', 'error');
    }
};

// Export to PDF
exportPdfBtn.addEventListener('click', () => {
    generatePDF();
});

function generatePDF() {
    // Get current date in Philippines timezone
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    
    // Filter expenses for the current selected date
    const filteredExpenses = expenses.filter(expense => {
        const expenseDateStr = getPhilippinesDateString(expense.date.toDate());
        return expenseDateStr === currentDate;
    });

    // Calculate total in display currency
    let total = 0;
    for (const expense of filteredExpenses) {
        const currency = expense.currency || 'PHP';
        if (currency === currentCurrencyFilter) {
            total += expense.amount;
        } else {
            // Convert to display currency if different
            const converted = convertAmountSync(expense.amount, currency, currentCurrencyFilter);
            total += converted;
        }
    }
    
    // Get budget info for current date
    const currentBudget = dailyBudgets[currentDate];
    let budgetText = 'Not Set';
    let remainingText = 'N/A';
    
    if (currentBudget && currentBudget.amount > 0) {
        const budgetSymbol = getCurrencySymbol(currentBudget.currency);
        budgetText = `${budgetSymbol}${formatNumber(currentBudget.amount, 2)}`;
        
        // Calculate remaining budget
        const remaining = currentBudget.amount - total;
        remainingText = `${budgetSymbol}${formatNumber(remaining, 2)}`;
    }

    // Create PDF content
    const displaySymbol = getCurrencySymbol(currentCurrencyFilter);
    const pdfContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                h1 { color: #2563eb; margin-bottom: 10px; }
                .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
                .summary { background: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                .summary-item { margin: 10px 0; font-size: 18px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #2563eb; color: white; padding: 12px; text-align: left; }
                td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
                tr:nth-child(even) { background: #f8fafc; }
                .total { font-size: 24px; font-weight: bold; color: #2563eb; margin-top: 20px; }
                .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>FinBud - Expense Report</h1>
                <p>Generated on ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}</p>
                <p>User: ${currentUser.displayName || currentUser.email}</p>
            </div>
            <div class="summary">
                <div class="summary-item"><strong>Date:</strong> ${new Date(currentDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div class="summary-item"><strong>Budget:</strong> ${budgetText}</div>
                <div class="summary-item"><strong>Total Expenses:</strong> ${displaySymbol}${formatNumber(total, 2)}</div>
                <div class="summary-item"><strong>Remaining Budget:</strong> ${remainingText}</div>
                <div class="summary-item"><strong>Number of Items:</strong> ${filteredExpenses.length}</div>
            </div>
            <h2>Expense Details</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredExpenses.length > 0 ? filteredExpenses.map(expense => {
                        const expenseDate = expense.date.toDate();
                        const expenseSymbol = getCurrencySymbol(expense.currency || 'PHP');
                        return `
                        <tr>
                            <td>${expenseDate.toLocaleDateString()} ${expenseDate.toLocaleTimeString()}</td>
                            <td>${expense.name}</td>
                            <td>${expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}</td>
                            <td>${expenseSymbol}${formatNumber(expense.amount, 2)}</td>
                        </tr>
                    `}).join('') : '<tr><td colspan="4" style="text-align: center;">No expenses for this date</td></tr>'}
                </tbody>
            </table>
            <div class="total">Total: ${displaySymbol}${formatNumber(total, 2)}</div>
            <div class="footer">
                <p>This report was generated by FinBud</p>
                <p>© ${now.getFullYear()} FinBud. All rights reserved.</p>
            </div>
        </body>
        </html>
    `;

    // Open print dialog
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(pdfContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
    }, 250);
}

// View expense details
window.viewExpense = function(expenseId) {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;
    
    currentExpenseId = expenseId;
    
    const currency = expense.currency || 'PHP';
    const symbol = getCurrencySymbol(currency);
    
    document.getElementById('viewExpenseName').textContent = expense.name;
    document.getElementById('viewExpenseAmount').textContent = symbol + formatNumber(expense.amount, 2);
    document.getElementById('viewExpenseCurrency').textContent = currency;
    document.getElementById('viewExpenseCategory').textContent = 
        expense.category.charAt(0).toUpperCase() + expense.category.slice(1);
    document.getElementById('viewExpenseDate').textContent = 
        expense.date.toDate().toLocaleString();
    document.getElementById('viewExpenseNotes').textContent = expense.notes || 'No notes';
    
    // Reset convert result
    document.getElementById('convertResult').classList.remove('show');
    document.getElementById('convertResult').textContent = '';
    
    document.getElementById('viewExpenseModal').classList.add('active');
};

// Close view expense modal
document.getElementById('closeViewExpense').addEventListener('click', () => {
    document.getElementById('viewExpenseModal').classList.remove('active');
});

// Quick convert in view modal
document.getElementById('quickConvertBtn').addEventListener('click', async () => {
    if (!currentExpenseId) return;
    
    const expense = expenses.find(e => e.id === currentExpenseId);
    if (!expense) return;
    
    const targetCurrency = document.getElementById('quickConvertCurrency').value;
    const sourceCurrency = expense.currency || 'PHP';
    const amount = expense.amount;
    
    // Ensure exchange rates are loaded
    if (Object.keys(exchangeRates).length === 0) {
        await fetchExchangeRates();
    }
    
    let result;
    if (sourceCurrency === targetCurrency) {
        result = amount;
    } else if (sourceCurrency === 'USD') {
        result = amount * exchangeRates[targetCurrency];
    } else if (targetCurrency === 'USD') {
        result = amount / exchangeRates[sourceCurrency];
    } else {
        const amountInUSD = amount / exchangeRates[sourceCurrency];
        result = amountInUSD * exchangeRates[targetCurrency];
    }
    
    const targetSymbol = getCurrencySymbol(targetCurrency);
    document.getElementById('convertResult').textContent = 
        `≈ ${targetSymbol}${formatNumber(result, 2)}`;
    document.getElementById('convertResult').classList.add('show');
});

// Edit expense
window.editExpense = function(expenseId) {
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;
    
    currentExpenseId = expenseId;
    
    document.getElementById('editExpenseId').value = expenseId;
    document.getElementById('editExpenseName').value = expense.name;
    document.getElementById('editExpenseAmount').value = expense.amount;
    document.getElementById('editExpenseCurrency').value = expense.currency || 'PHP';
    document.getElementById('editExpenseCategory').value = expense.category;
    
    // Convert Firestore timestamp to datetime-local format
    const date = expense.date.toDate();
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date - offset)).toISOString().slice(0, 16);
    document.getElementById('editExpenseDate').value = localISOTime;
    
    document.getElementById('editExpenseNotes').value = expense.notes || '';
    
    document.getElementById('editExpenseModal').classList.add('active');
};

// Close edit modal
document.getElementById('closeEditExpense').addEventListener('click', () => {
    document.getElementById('editExpenseModal').classList.remove('active');
});

document.querySelector('.cancel-edit-btn').addEventListener('click', () => {
    document.getElementById('editExpenseModal').classList.remove('active');
});

// Handle edit form submission
document.getElementById('editExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const expenseId = document.getElementById('editExpenseId').value;
    const expenseName = document.getElementById('editExpenseName').value;
    const updatedExpense = {
        name: expenseName,
        amount: parseFloat(document.getElementById('editExpenseAmount').value),
        currency: document.getElementById('editExpenseCurrency').value,
        category: document.getElementById('editExpenseCategory').value,
        date: Timestamp.fromDate(new Date(document.getElementById('editExpenseDate').value)),
        notes: document.getElementById('editExpenseNotes').value
    };
    
    try {
        await updateDoc(doc(db, 'expenses', expenseId), updatedExpense);
        showToast(`Expense "${expenseName}" updated successfully!`, 'success');
        document.getElementById('editExpenseModal').classList.remove('active');
        loadExpenses();
    } catch (error) {
        console.error('Error updating expense:', error);
        showToast('Failed to update expense. Please try again.', 'error');
    }
});

// Load daily budgets from localStorage
// Load daily budgets from Firebase
async function loadDailyBudgets() {
    if (!currentUser) return;
    
    try {
        const budgetsQuery = query(
            collection(db, 'budgets'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(budgetsQuery);
        
        // Clear existing budgets and reload from Firebase
        dailyBudgets = {};
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            dailyBudgets[data.date] = {
                id: doc.id, // Store document ID for updates
                amount: data.amount,
                currency: data.currency,
                name: data.name || ''
            };
        });
    } catch (error) {
        console.error('Error loading budgets:', error);
        showToast('Failed to load budgets', 'error');
    }
}

// Save or update a daily budget in Firebase
async function saveDailyBudget(date, budgetData) {
    if (!currentUser) return;
    
    try {
        const existingBudget = dailyBudgets[date];
        
        if (existingBudget && existingBudget.id) {
            // Update existing budget document
            await updateDoc(doc(db, 'budgets', existingBudget.id), {
                amount: budgetData.amount,
                currency: budgetData.currency,
                name: budgetData.name || '',
                updatedAt: Timestamp.now()
            });
            showToast('Budget updated successfully!', 'success');
        } else {
            // Create new budget document
            const docRef = await addDoc(collection(db, 'budgets'), {
                userId: currentUser.uid,
                date: date,
                amount: budgetData.amount,
                currency: budgetData.currency,
                name: budgetData.name || '',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
            
            // Store the document ID
            budgetData.id = docRef.id;
            showToast('Budget set successfully!', 'success');
        }
        
        // Update local cache
        dailyBudgets[date] = budgetData;
    } catch (error) {
        console.error('Error saving budget:', error);
        showToast('Failed to save budget. Please try again.', 'error');
        throw error;
    }
}

// Delete a daily budget from Firebase
async function deleteDailyBudget(date) {
    if (!currentUser) return;
    
    try {
        const budget = dailyBudgets[date];
        if (budget && budget.id) {
            await deleteDoc(doc(db, 'budgets', budget.id));
            showToast('Budget deleted successfully!', 'success');
        }
        
        // Remove from local cache
        delete dailyBudgets[date];
    } catch (error) {
        console.error('Error deleting budget:', error);
        showToast('Failed to delete budget. Please try again.', 'error');
        throw error;
    }
}

// Update budget display on load
async function updateBudgetDisplay() {
    const budgetElement = document.getElementById('budgetAmount');
    const budgetNameElement = document.getElementById('budgetName');
    const setBudgetBtn = document.getElementById('setBudgetBtn');
    const editBudgetBtn = document.getElementById('editBudgetBtn');
    const deleteBudgetBtnCard = document.getElementById('deleteBudgetBtnCard');
    
    const currentBudget = dailyBudgets[currentDate];
    
    if (currentBudget && currentBudget.amount > 0) {
        // Ensure exchange rates are loaded
        if (Object.keys(exchangeRates).length === 0) {
            await fetchExchangeRates();
        }
        
        // Use display currency from filter
        const displayCurrency = currentCurrencyFilter === 'native' ? currentBudget.currency : currentCurrencyFilter;
        let displayAmount;
        
        if (currentBudget.currency === displayCurrency) {
            displayAmount = currentBudget.amount;
        } else {
            displayAmount = await convertAmount(currentBudget.amount, currentBudget.currency, displayCurrency);
        }
        
        const symbol = getCurrencySymbol(displayCurrency);
        budgetElement.textContent = symbol + formatBudgetAmount(displayAmount, budgetElement);
        
        // Display budget name if exists
        if (currentBudget.name) {
            budgetNameElement.textContent = currentBudget.name;
            budgetNameElement.style.display = 'block';
        } else {
            budgetNameElement.style.display = 'none';
        }
        
        // Show edit/delete buttons, hide set button
        setBudgetBtn.style.display = 'none';
        editBudgetBtn.style.display = 'inline-flex';
        deleteBudgetBtnCard.style.display = 'inline-flex';
    } else {
        budgetElement.textContent = 'Not Set';
        budgetNameElement.style.display = 'none';
        
        // Show set button, hide edit/delete buttons
        setBudgetBtn.style.display = 'inline-flex';
        editBudgetBtn.style.display = 'none';
        deleteBudgetBtnCard.style.display = 'none';
    }
}

// Set budget button
document.getElementById('setBudgetBtn').addEventListener('click', () => {
    document.getElementById('budgetModalTitle').textContent = 'Set Budget';
    document.getElementById('budgetNameInput').value = '';
    document.getElementById('budgetAmountInput').value = '';
    document.getElementById('budgetCurrency').value = 'PHP';
    document.getElementById('saveBudgetText').textContent = 'Set Budget';
    document.getElementById('deleteBudgetBtn').style.display = 'none';
    document.getElementById('budgetModal').classList.add('active');
});

// Edit budget button
document.getElementById('editBudgetBtn').addEventListener('click', () => {
    const currentBudget = dailyBudgets[currentDate];
    if (currentBudget) {
        document.getElementById('budgetModalTitle').textContent = 'Edit Budget';
        document.getElementById('budgetAmountInput').value = currentBudget.amount;
        document.getElementById('budgetCurrency').value = currentBudget.currency;
        document.getElementById('budgetNameInput').value = currentBudget.name || '';
        document.getElementById('saveBudgetText').textContent = 'Update';
        document.getElementById('deleteBudgetBtn').style.display = 'inline-flex';
        document.getElementById('budgetModal').classList.add('active');
    }
});

// Close budget modal
document.getElementById('closeBudget').addEventListener('click', () => {
    document.getElementById('budgetModal').classList.remove('active');
});

document.querySelector('.cancel-budget-btn').addEventListener('click', () => {
    document.getElementById('budgetModal').classList.remove('active');
});

// Handle budget form submission
document.getElementById('budgetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const budgetData = {
        amount: parseFloat(document.getElementById('budgetAmountInput').value),
        currency: document.getElementById('budgetCurrency').value,
        name: document.getElementById('budgetNameInput').value
    };
    
    // Save to Firebase instead of localStorage
    await saveDailyBudget(currentDate, budgetData);
    await updateBudgetDisplay();
    await filterAndDisplayExpenses();
    
    document.getElementById('budgetModal').classList.remove('active');
    showToast('Budget set successfully!', 'success');
});

// Delete budget button handler (in modal)
document.getElementById('deleteBudgetBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete this budget? This will also delete all expenses for this date.')) {
        // Delete budget from Firebase
        await deleteDailyBudget(currentDate);
        
        // Delete all expenses for this date
        const expensesToDelete = expenses.filter(expense => {
            const expenseDateStr = getPhilippinesDateString(expense.date.toDate());
            return expenseDateStr === currentDate;
        });
        
        for (const expense of expensesToDelete) {
            try {
                await deleteDoc(doc(db, 'expenses', expense.id));
            } catch (error) {
                console.error('Error deleting expense:', error);
            }
        }
        
        await loadExpenses();
        await updateBudgetDisplay();
        
        document.getElementById('budgetModal').classList.remove('active');
        showToast('Budget and expenses deleted successfully!', 'success');
    }
});

// Delete budget button handler (on card)
document.getElementById('deleteBudgetBtnCard').addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete this budget? This will also delete all expenses for this date.')) {
        // Delete budget from Firebase
        await deleteDailyBudget(currentDate);
        
        // Delete all expenses for this date
        const expensesToDelete = expenses.filter(expense => {
            const expenseDateStr = getPhilippinesDateString(expense.date.toDate());
            return expenseDateStr === currentDate;
        });
        
        for (const expense of expensesToDelete) {
            try {
                await deleteDoc(doc(db, 'expenses', expense.id));
            } catch (error) {
                console.error('Error deleting expense:', error);
            }
        }
        
        await loadExpenses();
        await updateBudgetDisplay();
        
        showToast('Budget and expenses deleted successfully!', 'success');
    }
});

// Currency Converter
let exchangeRates = {};
const baseCurrency = 'USD';

async function fetchExchangeRates() {
    try {
        // Using ExchangeRate-API.com (free tier - 1,500 requests/month)
        const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
        const data = await response.json();
        
        if (data.result === 'success') {
            exchangeRates = data.rates;
            const updateTime = new Date(data.time_last_update_utc).toLocaleString();
            document.getElementById('rateUpdate').textContent = `Last updated: ${updateTime}`;
        } else {
            throw new Error('Failed to fetch rates');
        }
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        showToast('Failed to fetch exchange rates. Please check your internet connection.', 'error');
    }
}

// Initialize converter when tab is active
document.querySelector('[data-tab="converter"]').addEventListener('click', () => {
    // Always fetch fresh rates when opening converter
    fetchExchangeRates();
});

// Real-time conversion
document.getElementById('fromAmount').addEventListener('input', convertCurrency);
document.getElementById('fromCurrency').addEventListener('change', convertCurrency);
document.getElementById('toCurrency').addEventListener('change', convertCurrency);

function convertCurrency() {
    const amount = parseFloat(document.getElementById('fromAmount').value) || 0;
    const fromCurrency = document.getElementById('fromCurrency').value;
    const toCurrency = document.getElementById('toCurrency').value;

    if (Object.keys(exchangeRates).length === 0) {
        fetchExchangeRates().then(() => performConversion(amount, fromCurrency, toCurrency));
    } else {
        performConversion(amount, fromCurrency, toCurrency);
    }
}

function performConversion(amount, fromCurrency, toCurrency) {
    let result;
    
    if (fromCurrency === baseCurrency) {
        result = amount * exchangeRates[toCurrency];
    } else if (toCurrency === baseCurrency) {
        result = amount / exchangeRates[fromCurrency];
    } else {
        const amountInBase = amount / exchangeRates[fromCurrency];
        result = amountInBase * exchangeRates[toCurrency];
    }

    // For input fields, use plain number format without commas
    document.getElementById('toAmount').value = result.toFixed(4);
    
    // Display formatted amount with commas
    const symbol = getCurrencySymbol(toCurrency);
    document.getElementById('toAmountFormatted').textContent = symbol + formatNumber(result, 2);
    
    const rate = result / amount;
    document.getElementById('exchangeRate').textContent = 
        `1 ${fromCurrency} = ${formatNumber(rate, 4)} ${toCurrency}`;
}

// Swap currencies
document.getElementById('swapCurrencies').addEventListener('click', () => {
    const fromCurrency = document.getElementById('fromCurrency').value;
    const toCurrency = document.getElementById('toCurrency').value;
    const fromAmount = document.getElementById('fromAmount').value;
    const toAmount = document.getElementById('toAmount').value;

    document.getElementById('fromCurrency').value = toCurrency;
    document.getElementById('toCurrency').value = fromCurrency;
    document.getElementById('fromAmount').value = toAmount;
    
    convertCurrency();
});

// Price Checker
const currencyMap = {
    'PH': 'PHP',
    'US': 'USD',
    'GB': 'GBP',
    'JP': 'JPY',
    'SG': 'SGD',
    'AU': 'AUD',
    'CA': 'CAD'
};

document.getElementById('checkPriceBtn').addEventListener('click', async () => {
    const itemName = document.getElementById('itemName').value.trim();
    const itemPrice = parseFloat(document.getElementById('itemPrice').value);
    const country = document.getElementById('priceCountry').value;

    if (!itemName || !itemPrice) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    if (Object.keys(exchangeRates).length === 0) {
        await fetchExchangeRates();
    }

    const currency = currencyMap[country];
    let priceInPHP;

    // Convert to PHP
    if (currency === 'PHP') {
        priceInPHP = itemPrice;
    } else {
        const amountInUSD = itemPrice / exchangeRates[currency];
        priceInPHP = amountInUSD * exchangeRates['PHP'];
    }

    // Simulate market average (in real app, this would come from API)
    // For demo, we'll use a random variation
    const marketAverage = priceInPHP * (0.85 + Math.random() * 0.3);
    const difference = priceInPHP - marketAverage;
    const percentDiff = (difference / marketAverage) * 100;

    let verdict, verdictText;
    if (percentDiff < -15) {
        verdict = 'steal';
        verdictText = 'Amazing Deal! 🎉';
    } else if (percentDiff < -5) {
        verdict = 'good';
        verdictText = 'Good Price 👍';
    } else if (percentDiff < 10) {
        verdict = 'normal';
        verdictText = 'Fair Price ✓';
    } else {
        verdict = 'overpriced';
        verdictText = 'Overpriced ⚠️';
    }

    document.getElementById('verdictBadge').className = `verdict-badge ${verdict}`;
    document.getElementById('verdictBadge').textContent = verdict.toUpperCase();
    document.getElementById('verdictText').textContent = verdictText;
    document.getElementById('originalPrice').textContent = `${currency} ${itemPrice.toFixed(2)}`;
    document.getElementById('convertedPrice').textContent = `₱${priceInPHP.toFixed(2)}`;
    document.getElementById('marketAverage').textContent = `₱${marketAverage.toFixed(2)}`;
    document.getElementById('priceDifference').textContent = 
        `${difference >= 0 ? '+' : ''}₱${difference.toFixed(2)} (${percentDiff >= 0 ? '+' : ''}${percentDiff.toFixed(2)}%)`;
    
    document.getElementById('priceAnalysis').innerHTML = `
        <p><strong>Analysis:</strong> Based on current market data, this ${itemName} is priced 
        ${Math.abs(percentDiff).toFixed(2)}% ${difference >= 0 ? 'above' : 'below'} the average market price. 
        ${verdict === 'steal' ? 'This is an excellent deal that you should consider!' : 
          verdict === 'good' ? 'This is a fair price for this item.' :
          verdict === 'normal' ? 'The price is within normal market range.' :
          'You might want to look for better deals elsewhere.'}</p>
        <p><em>Note: Market averages are estimates and may vary by location and retailer.</em></p>
    `;
    
    document.getElementById('priceResults').style.display = 'block';
});

// Translator - Using MyMemory Translation API (free and reliable)
const MYMEMORY_API = 'https://api.mymemory.translated.net/get';
let translationTimeout;

document.getElementById('sourceText').addEventListener('input', (e) => {
    const text = e.target.value;
    document.getElementById('sourceCharCount').textContent = `${text.length} / 5000`;
    
    clearTimeout(translationTimeout);
    translationTimeout = setTimeout(() => {
        if (text.trim()) {
            translateText(text);
        }
    }, 500);
});

document.getElementById('sourceLanguage').addEventListener('change', () => {
    const text = document.getElementById('sourceText').value;
    if (text.trim()) {
        translateText(text);
    }
});

document.getElementById('targetLanguage').addEventListener('change', () => {
    const text = document.getElementById('sourceText').value;
    if (text.trim()) {
        translateText(text);
    }
});

async function translateText(text) {
    const sourceLang = document.getElementById('sourceLanguage').value;
    const targetLang = document.getElementById('targetLanguage').value;

    if (sourceLang === targetLang && sourceLang !== 'auto') {
        document.getElementById('translatedText').value = text;
        document.getElementById('copyTranslation').style.display = 'block';
        return;
    }

    try {
        // MyMemory API uses format: source|target (e.g., "en|es")
        // For auto-detect, just use target language
        const langPair = sourceLang === 'auto' ? targetLang : `${sourceLang}|${targetLang}`;
        const url = `${MYMEMORY_API}?q=${encodeURIComponent(text)}&langpair=${langPair}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.responseStatus === 200 && data.responseData) {
            document.getElementById('translatedText').value = data.responseData.translatedText;
            document.getElementById('copyTranslation').style.display = 'block';
        } else {
            throw new Error('Translation failed');
        }
    } catch (error) {
        console.error('Translation error:', error);
        showToast('Translation failed. Please try again.', 'error');
    }
}

document.getElementById('swapLanguages').addEventListener('click', () => {
    const sourceLang = document.getElementById('sourceLanguage').value;
    const targetLang = document.getElementById('targetLanguage').value;
    const sourceText = document.getElementById('sourceText').value;
    const translatedText = document.getElementById('translatedText').value;

    if (sourceLang === 'auto') {
        showToast('Cannot swap with auto-detect', 'error');
        return;
    }

    document.getElementById('sourceLanguage').value = targetLang;
    document.getElementById('targetLanguage').value = sourceLang;
    document.getElementById('sourceText').value = translatedText;
    
    if (translatedText.trim()) {
        translateText(translatedText);
    }
});

document.getElementById('copyTranslation').addEventListener('click', () => {
    const text = document.getElementById('translatedText').value;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    });
});

// Map Navigation using Geoapify
// ⚠️ IMPORTANT: Replace this with your valid Geoapify API key from https://www.geoapify.com/
// Geoapify API key is now handled by Netlify Functions (serverless)
// No need to expose API key in client-side code!

// If API key is invalid, we'll use OpenStreetMap as fallback
const USE_GEOAPIFY_TILES = false; // Set to false to use free OpenStreetMap tiles instead (recommended with serverless functions)

let currentTileLayer = null;
let routeLayer = null;
let markersLayer = null;
let currentTransportMode = 'drive';
let sourceCoords = null;
let destCoords = null;

function initMap() {
    console.log('Initializing map...');
    
    if (!map) {
        try {
            const mapElement = document.getElementById('map');
            if (!mapElement) {
                console.error('Map element not found!');
                return;
            }
            
            console.log('Creating Leaflet map...');
            map = L.map('map').setView([14.5905, 120.9780], 13); // Mapua University area
            
            console.log('Adding tile layer...');
            
            // Choose tile layer based on configuration
            if (USE_GEOAPIFY_TILES) {
                // Geoapify tiles (requires valid API key)
                currentTileLayer = L.tileLayer('https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=' + GEOAPIFY_API_KEY, {
                    attribution: '© <a href="https://www.geoapify.com/">Geoapify</a> | © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 20
                }).addTo(map);
            } else {
                // Free OpenStreetMap tiles (no API key needed)
                currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19
                }).addTo(map);
            }
            
            // Initialize marker layer
            markersLayer = L.layerGroup().addTo(map);
            
            console.log('Map initialized successfully!');
            
            // Force map to render properly
            setTimeout(() => {
                map.invalidateSize();
            }, 200);
        } catch (error) {
            console.error('Error initializing map:', error);
            showToast('Failed to initialize map. Please refresh the page.', 'error');
        }
    } else {
        console.log('Map already exists, refreshing size...');
        map.invalidateSize();
    }
}

// Tab switching for Geocoding/Routing
document.querySelectorAll('.geoapify-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        // Update active tab
        document.querySelectorAll('.geoapify-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        document.querySelectorAll('.geoapify-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName + 'Tab').classList.add('active');
    });
});

// Transport mode selection
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTransportMode = btn.dataset.mode;
    });
});

// Geocoding Search
document.getElementById('geocodeBtn').addEventListener('click', async () => {
    const searchQuery = document.getElementById('geocodeSearch').value.trim();
    if (!searchQuery) {
        showToast('Please enter a location to search', 'error');
        return;
    }
    
    try {
        showToast('Searching location...', 'info');
        
        // Use Netlify Function instead of direct API call
        const url = `/api/geocode?text=${encodeURIComponent(searchQuery)}`;
        console.log('Fetching:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Geocoding response:', data);
        
        if (data.features && data.features.length > 0) {
            displayGeocodeResults(data.features);
            showToast('Location found!', 'success');
        } else {
            document.getElementById('geocodeResults').innerHTML = '<p class="no-results">No results found. Try a different search term.</p>';
            showToast('No results found', 'error');
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        const errorMsg = error.message.includes('Invalid API key') 
            ? 'Invalid Geoapify API key. Please update the API key in script.js or visit https://www.geoapify.com/ to get a free key.'
            : `Error: ${error.message}`;
        document.getElementById('geocodeResults').innerHTML = `<p class="no-results">${errorMsg}</p>`;
        showToast('API key error - Check console', 'error');
    }
});

// Allow Enter key for geocoding search
document.getElementById('geocodeSearch').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('geocodeBtn').click();
    }
});

function displayGeocodeResults(features) {
    const resultsDiv = document.getElementById('geocodeResults');
    resultsDiv.innerHTML = '';
    
    features.slice(0, 5).forEach((feature, index) => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;
        
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <div class="result-header">
                <svg viewBox="0 0 24 24" fill="currentColor" class="result-icon">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <div class="result-info">
                    <div class="result-name">${props.name || props.formatted || 'Unknown'}</div>
                    <div class="result-address">${props.formatted}</div>
                </div>
            </div>
            <div class="result-details">
                <span class="result-coord">Lat: ${coords[1].toFixed(6)}, Lon: ${coords[0].toFixed(6)}</span>
            </div>
        `;
        
        resultItem.addEventListener('click', () => {
            showLocationOnMap(coords[1], coords[0], props.formatted);
        });
        
        resultsDiv.appendChild(resultItem);
    });
}

function showLocationOnMap(lat, lon, name) {
    map.setView([lat, lon], 15);
    
    // Clear previous markers
    markersLayer.clearLayers();
    
    // Add new marker
    const marker = L.marker([lat, lon]).addTo(markersLayer);
    marker.bindPopup(`<strong>${name}</strong><br>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`).openPopup();
}

// Use current location as source
document.getElementById('useCurrentSource').addEventListener('click', () => {
    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser', 'error');
        return;
    }
    
    showToast('Getting your location...', 'info');
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            sourceCoords = [lat, lon];
            
            // Reverse geocode to get address using Netlify Function
            try {
                const response = await fetch(
                    `/api/reverse-geocode?lat=${lat}&lon=${lon}`
                );
                const data = await response.json();
                
                if (data.features && data.features.length > 0) {
                    const address = data.features[0].properties.formatted;
                    document.getElementById('routeSource').value = address;
                    showToast('Current location set as source', 'success');
                }
            } catch (error) {
                document.getElementById('routeSource').value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
                showToast('Location set (coordinates)', 'success');
            }
        },
        (error) => {
            showToast('Unable to get your location', 'error');
        }
    );
});

// Geocode address inputs for routing
async function geocodeAddress(address) {
    try {
        const response = await fetch(
            `/api/geocode?text=${encodeURIComponent(address)}`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const coords = data.features[0].geometry.coordinates;
            return [coords[1], coords[0]]; // Return as [lat, lon]
        }
        return null;
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// Generate Route
document.getElementById('generateRouteBtn').addEventListener('click', async () => {
    const sourceInput = document.getElementById('routeSource').value.trim();
    const destInput = document.getElementById('routeDestination').value.trim();
    
    if (!sourceInput || !destInput) {
        showToast('Please enter both source and destination', 'error');
        return;
    }
    
    showToast('Generating route...', 'info');
    
    try {
        // Geocode source if not already coordinates
        if (!sourceCoords) {
            sourceCoords = await geocodeAddress(sourceInput);
            if (!sourceCoords) {
                showToast('Could not find source location', 'error');
                return;
            }
        }
        
        // Geocode destination
        destCoords = await geocodeAddress(destInput);
        if (!destCoords) {
            showToast('Could not find destination', 'error');
            return;
        }
        
        // Fetch route from Geoapify via Netlify Function
        // Geoapify Routing API expects waypoints in lat,lon format
        const waypoints = `${sourceCoords[0]},${sourceCoords[1]}|${destCoords[0]},${destCoords[1]}`;
        console.log('Source coords [lat,lon]:', sourceCoords);
        console.log('Dest coords [lat,lon]:', destCoords);
        console.log('Waypoints for API [lat,lon]:', waypoints);
        
        const response = await fetch(
            `/api/routing?waypoints=${waypoints}&mode=${currentTransportMode}`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Routing API response:', data);
        
        if (data.features && data.features.length > 0) {
            console.log('Route feature:', data.features[0]);
            displayRoute(data.features[0]);
            showToast('Route generated successfully!', 'success');
        } else {
            console.log('No features in response. Full data:', data);
            showToast('Could not generate route', 'error');
        }
    } catch (error) {
        console.error('Routing error:', error);
        showToast('Routing failed: ' + error.message, 'error');
    }
});

function displayRoute(feature) {
    const props = feature.properties;
    const geometry = feature.geometry;
    
    // Validate geometry exists and has coordinates
    if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
        showToast('Invalid route data received', 'error');
        console.error('Invalid geometry:', geometry);
        return;
    }
    
    // Clear previous route
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
    markersLayer.clearLayers();
    
    // Handle different coordinate structures
    // Geoapify returns MultiLineString: [[[lon,lat], [lon,lat]...]]
    // or LineString: [[lon,lat], [lon,lat]...]
    let coords = geometry.coordinates;
    console.log('Geometry type:', geometry.type);
    console.log('Raw coordinates:', coords);
    
    // If it's a MultiLineString, get the first linestring
    if (geometry.type === 'MultiLineString' && Array.isArray(coords[0][0])) {
        coords = coords[0];
    }
    
    // Convert coordinates for Leaflet (swap lon, lat to lat, lon)
    const coordinates = coords.map(coord => {
        if (!coord || coord.length < 2 || coord[0] == null || coord[1] == null) {
            console.error('Invalid coordinate:', coord);
            return null;
        }
        return [coord[1], coord[0]];
    }).filter(coord => coord !== null);
    
    console.log('Processed coordinates:', coordinates);
    
    // Validate we have valid coordinates
    if (coordinates.length === 0) {
        showToast('No valid coordinates in route', 'error');
        return;
    }
    
    // Draw route on map
    routeLayer = L.polyline(coordinates, {
        color: '#4285f4',
        weight: 5,
        opacity: 0.7
    }).addTo(map);
    
    // Add markers for source and destination
    const startMarker = L.marker(coordinates[0], {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #34a853; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white;"></div>',
            iconSize: [24, 24]
        })
    }).addTo(markersLayer);
    startMarker.bindPopup('<strong>Start</strong>');
    
    const endMarker = L.marker(coordinates[coordinates.length - 1], {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #ea4335; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white;"></div>',
            iconSize: [24, 24]
        })
    }).addTo(markersLayer);
    endMarker.bindPopup('<strong>Destination</strong>');
    
    // Fit map to route
    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
    
    // Display route information
    const distance = (props.distance / 1000).toFixed(2); // Convert to km
    const duration = Math.round(props.time / 60); // Convert to minutes
    
    const routeInfoSection = document.getElementById('routeInfo');
    const routeDetails = document.getElementById('routeDetails');
    
    routeDetails.innerHTML = `
        <div class="route-stat">
            <svg viewBox="0 0 24 24" fill="currentColor" class="stat-icon">
                <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/>
            </svg>
            <div>
                <div class="stat-label">Distance</div>
                <div class="stat-value">${distance} km</div>
            </div>
        </div>
        <div class="route-stat">
            <svg viewBox="0 0 24 24" fill="currentColor" class="stat-icon">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
            </svg>
            <div>
                <div class="stat-label">Duration</div>
                <div class="stat-value">${duration} min</div>
            </div>
        </div>
        <div class="route-stat">
            <svg viewBox="0 0 24 24" fill="currentColor" class="stat-icon">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <div>
                <div class="stat-label">Mode</div>
                <div class="stat-value">${currentTransportMode.charAt(0).toUpperCase() + currentTransportMode.slice(1)}</div>
            </div>
        </div>
    `;
    
    routeInfoSection.style.display = 'block';
}

// Close modals when clicking outside
document.getElementById('viewExpenseModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('viewExpenseModal')) {
        document.getElementById('viewExpenseModal').classList.remove('active');
    }
});

document.getElementById('editExpenseModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editExpenseModal')) {
        document.getElementById('editExpenseModal').classList.remove('active');
    }
});

document.getElementById('budgetModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('budgetModal')) {
        document.getElementById('budgetModal').classList.remove('active');
    }
});

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Initialize
convertCurrency();
// ============================================
// PASSWORD TOGGLE FUNCTIONALITY
// ============================================
document.addEventListener('click', (e) => {
    if (e.target.closest('.password-toggle')) {
        const button = e.target.closest('.password-toggle');
        const targetId = button.dataset.target;
        const input = document.getElementById(targetId);
        const eyeIcon = button.querySelector('.eye-icon');
        const eyeOffIcon = button.querySelector('.eye-off-icon');
        
        if (input.type === 'password') {
            input.type = 'text';
            eyeIcon.style.display = 'none';
            eyeOffIcon.style.display = 'block';
        } else {
            input.type = 'password';
            eyeIcon.style.display = 'block';
            eyeOffIcon.style.display = 'none';
        }
    }
});

// ============================================
// MANAGE ACCOUNT MODAL
// ============================================
const manageAccountModal = document.getElementById('manageAccountModal');
const userGreetingBtn = document.getElementById('userGreeting');
const closeManageAccount = document.getElementById('closeManageAccount');

// Open manage account modal
userGreetingBtn.addEventListener('click', () => {
    manageAccountModal.classList.add('active');
    // Pre-fill current username
    if (currentUser && currentUser.displayName) {
        document.getElementById('newUsername').value = currentUser.displayName;
    }
    // Display current email
    if (currentUser && currentUser.email) {
        document.getElementById('currentEmailDisplay').textContent = currentUser.email;
        document.getElementById('newEmail').placeholder = currentUser.email;
    }
});

// Close manage account modal
closeManageAccount.addEventListener('click', () => {
    manageAccountModal.classList.remove('active');
    resetAccountForms();
});

// Close modal on outside click
manageAccountModal.addEventListener('click', (e) => {
    if (e.target === manageAccountModal) {
        manageAccountModal.classList.remove('active');
        resetAccountForms();
    }
});

// Account tabs functionality
const accountTabs = document.querySelectorAll('.account-tab');
const accountTabContents = document.querySelectorAll('.account-tab-content');

accountTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.accountTab;
        
        // Update active tab
        accountTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        accountTabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${targetTab}Tab`).classList.add('active');
    });
});

// Reset all account forms
function resetAccountForms() {
    document.getElementById('updateUsernameForm').reset();
    document.getElementById('updateEmailForm').reset();
    document.getElementById('updatePasswordForm').reset();
    document.getElementById('deleteAccountForm').reset();
    
    // Reset to first tab
    accountTabs.forEach(t => t.classList.remove('active'));
    accountTabs[0].classList.add('active');
    accountTabContents.forEach(content => content.classList.remove('active'));
    accountTabContents[0].classList.add('active');
}

// ============================================
// UPDATE USERNAME
// ============================================
document.getElementById('updateUsernameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('newUsername').value.trim();
    
    if (!newUsername) {
        showToast('Please enter a valid username', 'error');
        return;
    }
    
    try {
        await updateProfile(currentUser, { displayName: newUsername });
        // Update data attribute only since button is icon-only
        document.getElementById('userGreeting').setAttribute('data-username', newUsername);
        showToast('Username updated successfully!', 'success');
        manageAccountModal.classList.remove('active');
        resetAccountForms();
    } catch (error) {
        console.error('Username update error:', error);
        showToast('Failed to update username. Please try again.', 'error');
    }
});

// ============================================
// UPDATE EMAIL
// ============================================
document.getElementById('updateEmailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newEmail = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('emailPassword').value;
    
    if (!newEmail) {
        showToast('Please enter a valid email', 'error');
        return;
    }
    
    try {
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        
        // Update email
        await updateEmail(currentUser, newEmail);
        showToast('Email updated successfully! Please verify your new email.', 'success');
        manageAccountModal.classList.remove('active');
        resetAccountForms();
    } catch (error) {
        console.error('Email update error:', error);
        let errorMessage = 'Failed to update email. Please try again.';
        
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already in use by another account.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format. Please check your email.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Please log out and log in again before changing your email.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Incorrect password. Please try again.';
        }
        
        showToast(errorMessage, 'error');
    }
});

// ============================================
// UPDATE PASSWORD
// ============================================
document.getElementById('updatePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmNewPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        
        // Update password
        await updatePassword(currentUser, newPassword);
        showToast('Password updated successfully!', 'success');
        manageAccountModal.classList.remove('active');
        resetAccountForms();
    } catch (error) {
        console.error('Password update error:', error);
        let errorMessage = 'Failed to update password. Please try again.';
        
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect current password. Please try again.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'New password is too weak. Please use at least 6 characters.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Please log out and log in again before changing your password.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Incorrect current password. Please try again.';
        }
        
        showToast(errorMessage, 'error');
    }
});

// ============================================
// DELETE ACCOUNT
// ============================================
document.getElementById('deleteAccountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const deletePassword = document.getElementById('deletePassword').value;
    const confirmDelete = document.getElementById('confirmDelete').checked;
    
    if (!confirmDelete) {
        showToast('Please confirm that you understand this action is permanent', 'error');
        return;
    }
    
    // Double confirmation
    const finalConfirmation = confirm(
        '⚠️ FINAL WARNING ⚠️\n\n' +
        'Are you absolutely sure you want to delete your account?\n\n' +
        'This will permanently delete:\n' +
        '• All your expenses\n' +
        '• All your budgets\n' +
        '• All your settings\n' +
        '• Your account data\n\n' +
        'This action CANNOT be undone!\n\n' +
        'Click OK to proceed with deletion, or Cancel to go back.'
    );
    
    if (!finalConfirmation) {
        return;
    }
    
    try {
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, deletePassword);
        await reauthenticateWithCredential(currentUser, credential);
        
        // Delete all user's expenses
        const expensesQuery = query(
            collection(db, 'expenses'),
            where('userId', '==', currentUser.uid)
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        const deletePromises = expensesSnapshot.docs.map(docSnapshot => 
            deleteDoc(doc(db, 'expenses', docSnapshot.id))
        );
        await Promise.all(deletePromises);
        
        // Delete all user's budgets
        const budgetsQuery = query(
            collection(db, 'budgets'),
            where('userId', '==', currentUser.uid)
        );
        const budgetsSnapshot = await getDocs(budgetsQuery);
        const budgetDeletePromises = budgetsSnapshot.docs.map(docSnapshot => 
            deleteDoc(doc(db, 'budgets', docSnapshot.id))
        );
        await Promise.all(budgetDeletePromises);
        
        // Delete user account
        await deleteUser(currentUser);
        
        showToast('Account deleted successfully. Goodbye!', 'success');
        manageAccountModal.classList.remove('active');
        resetAccountForms();
    } catch (error) {
        console.error('Account deletion error:', error);
        let errorMessage = 'Failed to delete account. Please try again.';
        
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Please log out and log in again before deleting your account.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Incorrect password. Please try again.';
        }
        
        showToast(errorMessage, 'error');
    }
});

// ============================================
// ENHANCED NOTIFICATIONS FOR OPERATIONS
// ============================================

// Add notification for successful expense addition
const originalAddExpense = expenseForm.onsubmit;

// ============================================
// DYNAMIC AMOUNT FORMATTING ON RESIZE
// ============================================

// Function to update all amount displays
function updateAllAmountDisplays() {
    // Update budget amount
    const budgetElement = document.getElementById('budgetAmount');
    const currentBudget = dailyBudgets[currentDate];
    
    if (currentBudget && currentBudget.amount > 0 && budgetElement.textContent !== 'Not Set') {
        const displayCurrency = currentCurrencyFilter === 'native' ? currentBudget.currency : currentCurrencyFilter;
        convertAmount(currentBudget.amount, currentBudget.currency, displayCurrency).then(displayAmount => {
            const symbol = getCurrencySymbol(displayCurrency);
            budgetElement.textContent = symbol + formatBudgetAmount(displayAmount, budgetElement);
        });
    }
    
    // Update summary cards
    const totalExpensesEl = document.getElementById('totalExpenses');
    const remainingEl = document.getElementById('remainingBudget');
    
    if (totalExpensesEl.textContent && totalExpensesEl.textContent !== '₱0.00') {
        // Re-trigger summary update
        filterAndDisplayExpenses();
    }
    
    // Update expense amounts in the list
    updateExpenseAmounts();
}

// Set up ResizeObserver to watch for size changes
const resizeObserver = new ResizeObserver(entries => {
    // Debounce the updates
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        updateAllAmountDisplays();
    }, 150);
});

// Observe the main content area
const contentMain = document.querySelector('.content-main');
if (contentMain) {
    resizeObserver.observe(contentMain);
}

// Also update on window resize
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        updateAllAmountDisplays();
    }, 150);
});