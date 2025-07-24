// Set up jsPDF for global access (as it's in a UMD bundle)
const { jsPDF } = window.jspdf;

let incomes = JSON.parse(localStorage.getItem('incomes') || '[]');
let expenses = JSON.parse(localStorage.getItem('expenses') || '[]');
let planned = JSON.parse(localStorage.getItem('planned') || '[]');

// Default number of items to show in lists
const DEFAULT_DISPLAY_LIMIT = 5;

// Keep track of whether "Show All" is active for each section
let showAllExpensesFlag = false;
let showAllDailyFlag = false;
let showAllWeeklyFlag = false;
let showAllPlannedFlag = false;

// State variables for mobile toggles (managed by handleInitialLayout)
let filtersVisibleMobile = false;
let moreDashboardCardsVisibleMobile = false;

// Chart instances for desktop and mobile
// Storing references to destroy and re-create for theme/data updates
let categoryChartDesktopInstance = null;
let monthlyChartDesktopInstance = null;
let weeklySpendingChartDesktopInstance = null;

let categoryChartMobileInstance = null;
let monthlyChartMobileInstance = null;
let weeklySpendingChartMobileInstance = null;

// NEW: Global state variables for expense sorting
let currentSortBy = 'date'; // Default sort by date
let currentSortOrder = 'desc'; // Default descending (latest first)


// --- Data Persistence ---
function save() {
    localStorage.setItem('incomes', JSON.stringify(incomes));
    localStorage.setItem('expenses', JSON.stringify(expenses));
    localStorage.setItem('planned', JSON.stringify(planned));
}

// --- Helper Functions for Dates and IDs ---
function getMonthKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getDayKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYearKey(dateStr) {
    const d = new Date(dateStr);
    return d.getFullYear().toString();
}

// Function to get ISO week number (Monday as first day of week)
function getWeekKey(dateStr) {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    // January 4 is always in week 1.
    const week1 = new Date(date.getFullYear(), 0, 4);
    // Adjust to Monday in week 1 and count number of weeks from date to week1.
    return date.getFullYear() + '-W' + String(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).padStart(2, '0');
}


// --- Modal Functions ---
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex'; // Use flex to center
    document.body.classList.add('modal-open'); // Prevent body scrolling
    // Focus on the first input in the modal for better UX
    if (modalId === 'incomeModal') {
        document.getElementById('modalIncomeAmount').focus();
    } else if (modalId === 'expenseModal') {
        document.getElementById('modalExpenseName').focus();
        // Pre-fill today's date for convenience (if not already set by editing)
        document.getElementById('modalExpenseDate').valueAsDate = new Date();
    } else if (modalId === 'plannedModal') {
        document.getElementById('modalPlanName').focus();
        // Pre-fill today's date for convenience
        document.getElementById('modalPlanDate').valueAsDate = new Date();
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    document.body.classList.remove('modal-open'); // Allow body scrolling
    // Clear modal inputs on close
    if (modalId === 'incomeModal') {
        document.getElementById('modalIncomeAmount').value = '';
        document.getElementById('modalIncomeNote').value = '';
    } else if (modalId === 'expenseModal') {
        document.getElementById('modalExpenseName').value = '';
        document.getElementById('modalExpenseAmount').value = '';
        document.getElementById('modalExpenseCategory').value = 'Food'; // Reset to default
        document.getElementById('modalExpenseNote').value = '';
        document.getElementById('modalExpenseDate').value = ''; // Clear date
    } else if (modalId === 'plannedModal') {
        document.getElementById('modalPlanName').value = '';
        document.getElementById('modalPlanAmount').value = '';
        document.getElementById('modalPlanDate').value = '';
        document.getElementById('modalPlanCategory').value = 'Food'; // Reset to default
        document.getElementById('modalPlanNote').value = '';
    } else if (modalId === 'editExpenseModal') {
        // No need to clear, as it's populated dynamically on open
    }
}

function submitIncomeModal() {
    const amount = parseFloat(document.getElementById('modalIncomeAmount').value);
    const note = document.getElementById('modalIncomeNote').value;

    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid income amount.');
        return;
    }

    const newIncome = {
        id: Date.now(), // Unique ID
        type: 'income',
        amount: amount,
        note: note,
        date: new Date().toISOString().split('T')[0] // YYYY-MM-DD (current date)
    };
    incomes.push(newIncome);
    save();
    updateAllDisplays();
    closeModal('incomeModal');
}

function submitExpenseModal() {
    const name = document.getElementById('modalExpenseName').value;
    const amount = parseFloat(document.getElementById('modalExpenseAmount').value);
    const category = document.getElementById('modalExpenseCategory').value;
    const date = document.getElementById('modalExpenseDate').value; // Get date from input
    const note = document.getElementById('modalExpenseNote').value;

    if (!name || isNaN(amount) || amount <= 0 || !date) {
        alert('Please enter a valid item name, amount, and date.');
        return;
    }

    const newExpense = {
        id: Date.now(), // Unique ID
        type: 'expense',
        name: name,
        amount: amount,
        category: category,
        note: note,
        date: date // Use the date from the input
    };
    expenses.push(newExpense);
    save();
    updateAllDisplays();
    closeModal('expenseModal');
}

function openEditExpenseModal(id) {
    const expenseToEdit = expenses.find(exp => exp.id === id);
    if (!expenseToEdit) {
        alert('Expense not found.');
        return;
    }

    document.getElementById('editExpenseId').value = expenseToEdit.id;
    document.getElementById('editExpenseName').value = expenseToEdit.name;
    document.getElementById('editExpenseAmount').value = expenseToEdit.amount;
    document.getElementById('editExpenseCategory').value = expenseToEdit.category;
    document.getElementById('editExpenseDate').value = expenseToEdit.date;
    document.getElementById('editExpenseNote').value = expenseToEdit.note || '';

    openModal('editExpenseModal');
}

function submitEditExpenseModal() {
    const id = parseInt(document.getElementById('editExpenseId').value);
    const name = document.getElementById('editExpenseName').value;
    const amount = parseFloat(document.getElementById('editExpenseAmount').value);
    const category = document.getElementById('editExpenseCategory').value;
    const date = document.getElementById('editExpenseDate').value;
    const note = document.getElementById('editExpenseNote').value;

    if (!name || isNaN(amount) || amount <= 0 || !date) {
        alert('Please fill in all required fields with valid data.');
        return;
    }

    const expenseIndex = expenses.findIndex(exp => exp.id === id);
    if (expenseIndex !== -1) {
        expenses[expenseIndex] = {
            id: id,
            type: 'expense',
            name: name,
            amount: amount,
            category: category,
            note: note,
            date: date
        };
        save();
        updateAllDisplays();
        closeModal('editExpenseModal');
    } else {
        alert('Error: Expense not found for editing.');
    }
}


function submitPlannedModal() {
    const name = document.getElementById('modalPlanName').value;
    const amount = parseFloat(document.getElementById('modalPlanAmount').value);
    const date = document.getElementById('modalPlanDate').value;
    const category = document.getElementById('modalPlanCategory').value;
    const note = document.getElementById('modalPlanNote').value;

    if (!name || isNaN(amount) || amount <= 0 || !date) {
        alert('Please enter a valid item name, amount, and planned date.');
        return;
    }

    const newPlanned = {
        id: Date.now(), // Unique ID
        name: name,
        amount: amount,
        date: date, // YYYY-MM-DD
        category: category,
        note: note
    };
    planned.push(newPlanned);
    save();
    updateAllDisplays();
    closeModal('plannedModal');
}

function markAsBought(id) {
    const plannedItemIndex = planned.findIndex(p => p.id === id);
    if (plannedItemIndex === -1) {
        alert("Planned item not found.");
        return;
    }

    const p = planned[plannedItemIndex];
    // Record as an expense with the current timestamp
    expenses.push({
        id: Date.now(), // New ID for the expense
        type: 'expense',
        name: p.name,
        amount: p.amount,
        category: p.category,
        note: `Planned purchase: ${p.note || p.name} (originally planned for ${p.date})`,
        date: new Date().toISOString().split('T')[0] // Current date
    });
    planned.splice(plannedItemIndex, 1); // Remove from planned
    save();
    updateAllDisplays();
    alert(`"${p.name}" marked as bought and added to expenses!`);
}

function deleteTransaction(id, type) {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) {
        return;
    }

    if (type === 'income') {
        incomes = incomes.filter(item => item.id !== id);
    } else if (type === 'expense') {
        expenses = expenses.filter(item => item.id !== id);
    } else if (type === 'planned') {
        planned = planned.filter(item => item.id !== id);
    }
    save();
    updateAllDisplays();
}

function resetAll() {
    if (confirm('Are you sure you want to reset all your budget data? This action cannot be undone.')) {
        localStorage.clear();
        incomes = [];
        expenses = [];
        planned = [];
        // NEW: Also reset default filter and sort states
        resetFilters(); // This will call updateAllDisplays
        alert('All data has been reset.');
    }
}


// --- Toggle functions for mobile views ---
function toggleFiltersMobile() {
    const filterContent = document.getElementById('filterCollapseContent');
    const toggleBtn = document.querySelector('.toggle-filters-btn');
    if (filtersVisibleMobile) {
        filterContent.style.display = 'none';
        toggleBtn.innerHTML = 'Show Filters <i class="fas fa-chevron-down"></i>';
    } else {
        filterContent.style.display = 'flex'; // Use flex for layout consistency
        toggleBtn.innerHTML = 'Hide Filters <i class="fas fa-chevron-up"></i>';
    }
    filtersVisibleMobile = !filtersVisibleMobile;
}

function toggleMobileActions() {
    // This function now just opens the modal
    openModal('mobileActionsModal');
}

function toggleDashboardCards() {
    const moreCards = document.getElementById('moreDashboardCards');
    const toggleBtn = document.querySelector('.toggle-dashboard-btn');
    if (moreDashboardCardsVisibleMobile) {
        moreCards.style.display = 'none';
        toggleBtn.innerHTML = 'Show More Balances <i class="fas fa-chevron-down"></i>';
    } else {
        moreCards.style.display = 'grid'; // Use grid to maintain card layout
        toggleBtn.innerHTML = 'Show Less Balances <i class="fas fa-chevron-up"></i>';
    }
    moreDashboardCardsVisibleMobile = !moreDashboardCardsVisibleMobile;
}


// --- Display Update Functions ---
function updateDashboard() {
    const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const overallBalance = totalIncome - totalExpenses;

    document.getElementById('overallIncome').textContent = `GHS ${totalIncome.toFixed(2)}`;
    document.getElementById('overallExpenses').textContent = `GHS ${totalExpenses.toFixed(2)}`;
    document.getElementById('overallBalance').textContent = `GHS ${overallBalance.toFixed(2)}`;

    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const currentMonthIncome = incomes.filter(inc => inc.date.startsWith(currentMonth))
                                    .reduce((sum, inc) => sum + inc.amount, 0);
    const currentMonthExpenses = expenses.filter(exp => exp.date.startsWith(currentMonth))
                                     .reduce((sum, exp) => sum + exp.amount, 0);
    const currentMonthBalance = currentMonthIncome - currentMonthExpenses;

    document.getElementById('currentMonthIncome').textContent = `GHS ${currentMonthIncome.toFixed(2)}`;
    document.getElementById('currentMonthExpenses').textContent = `GHS ${currentMonthExpenses.toFixed(2)}`;
    document.getElementById('currentMonthBalance').textContent = `GHS ${currentMonthBalance.toFixed(2)}`;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todaySpending = expenses.filter(exp => exp.date === today)
                                  .reduce((sum, exp) => sum + exp.amount, 0);
    document.getElementById('todaySpending').textContent = `GHS ${todaySpending.toFixed(2)}`;
}

// NEW: Helper function to sort any array of transactions
function sortTransactions(transactionsArray, sortBy, sortOrder) {
    if (!transactionsArray || transactionsArray.length === 0) {
        return [];
    }

    return transactionsArray.slice().sort((a, b) => {
        let valA, valB;

        switch (sortBy) {
            case 'name':
                valA = a.name ? a.name.toLowerCase() : '';
                valB = b.name ? b.name.toLowerCase() : '';
                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            case 'amount':
                valA = parseFloat(a.amount);
                valB = parseFloat(b.amount);
                return sortOrder === 'asc' ? valA - valB : valB - valA;
            case 'date':
            default: // Default to date if sortBy is not recognized
                valA = new Date(a.date);
                valB = new Date(b.date);
                return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
    });
}

// MODIFIED: renderHistory to apply sorting
function renderHistory(filteredExpenses) {
    const expenseHistoryDiv = document.getElementById('expenseHistory');
    expenseHistoryDiv.innerHTML = ''; // Clear previous entries

    // Apply the current global sort state to the filtered expenses
    const sortedExpenses = sortTransactions(filteredExpenses, currentSortBy, currentSortOrder);
    const itemsToDisplay = showAllExpensesFlag ? sortedExpenses : sortedExpenses.slice(0, DEFAULT_DISPLAY_LIMIT);

    if (itemsToDisplay.length === 0) {
        expenseHistoryDiv.innerHTML = '<p class="no-data-message">No expenses to display for the selected filters.</p>';
        document.getElementById('showMoreExpenses').style.display = 'none';
        return;
    }

    itemsToDisplay.forEach(exp => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'entry-item expense-item';
        itemDiv.innerHTML = `
            <div>
                <strong>${exp.name}</strong> - GHS ${exp.amount.toFixed(2)}
                <small>Category: ${exp.category} | Date: ${exp.date}</small>
                ${exp.note ? `<small>Note: ${exp.note}</small>` : ''}
            </div>
            <div class="item-actions">
                <button class="btn btn-small" onclick="openEditExpenseModal(${exp.id})"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-small" onclick="deleteTransaction(${exp.id}, 'expense')"><i class="fas fa-trash-alt"></i> Delete</button>
            </div>
        `;
        expenseHistoryDiv.appendChild(itemDiv);
    });

    document.getElementById('showMoreExpenses').style.display = sortedExpenses.length > DEFAULT_DISPLAY_LIMIT ? 'block' : 'none';
    document.getElementById('showMoreExpenses').textContent = showAllExpensesFlag ? 'Show Less Expenses' : `Show All Expenses (${sortedExpenses.length - DEFAULT_DISPLAY_LIMIT} more)`;
}

// NEW: Function to update sort criteria from UI (assumes dropdowns in HTML)
function setExpenseSortCriteria() {
    currentSortBy = document.getElementById('sortExpenseBy').value;
    currentSortOrder = document.getElementById('sortExpenseOrder').value;
    applyFiltersAndRender(); // Re-render with new sort
}


function renderDailySummary(filteredExpenses) {
    const dailySpendingSummaryDiv = document.getElementById('dailySpendingSummary');
    dailySpendingSummaryDiv.innerHTML = ''; // Clear previous entries

    const dailySummaryMap = {};
    filteredExpenses.forEach(exp => {
        const dayKey = getDayKey(exp.date);
        if (!dailySummaryMap[dayKey]) {
            dailySummaryMap[dayKey] = 0;
        }
        dailySummaryMap[dayKey] += exp.amount;
    });

    // Sort daily summaries by date descending
    const sortedDailySummaries = Object.keys(dailySummaryMap).sort((a, b) => new Date(b) - new Date(a));

    const itemsToDisplay = showAllDailyFlag ? sortedDailySummaries : sortedDailySummaries.slice(0, DEFAULT_DISPLAY_LIMIT);

    if (itemsToDisplay.length === 0) {
        dailySpendingSummaryDiv.innerHTML = '<p class="no-data-message">No daily spending to display for the selected filters.</p>';
        document.getElementById('showMoreDaily').style.display = 'none';
        return;
    }

    itemsToDisplay.forEach(dayKey => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'daily-summary-item';
        itemDiv.innerHTML = `
            <span class="date-info">${new Date(dayKey).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}:</span>
            <span class="total-amount">GHS ${dailySummaryMap[dayKey].toFixed(2)}</span>
        `;
        dailySpendingSummaryDiv.appendChild(itemDiv);
    });

    document.getElementById('showMoreDaily').style.display = sortedDailySummaries.length > DEFAULT_DISPLAY_LIMIT ? 'block' : 'none';
    document.getElementById('showMoreDaily').textContent = showAllDailyFlag ? 'Show Less Daily Summaries' : `Show All Daily Summaries (${sortedDailySummaries.length - DEFAULT_DISPLAY_LIMIT} more)`;
}

function renderWeeklySummary(filteredIncomes, filteredExpenses) {
    const weeklyFinancialSummaryDiv = document.getElementById('weeklyFinancialSummary');
    weeklyFinancialSummaryDiv.innerHTML = '';

    const weeklyIncomeMap = {};
    filteredIncomes.forEach(inc => {
        const weekKey = getWeekKey(inc.date);
        if (!weeklyIncomeMap[weekKey]) {
            weeklyIncomeMap[weekKey] = 0;
        }
        weeklyIncomeMap[weekKey] += inc.amount;
    });

    const weeklyExpenseMap = {};
    filteredExpenses.forEach(exp => {
        const weekKey = getWeekKey(exp.date);
        if (!weeklyExpenseMap[weekKey]) {
            weeklyExpenseMap[weekKey] = 0;
        }
        weeklyExpenseMap[weekKey] += exp.amount;
    });

    const allWeekKeys = Array.from(new Set([...Object.keys(weeklyIncomeMap), ...Object.keys(weeklyExpenseMap)]));
    allWeekKeys.sort((a, b) => {
        const [yearA, weekA] = a.split('-W').map(Number);
        const [yearB, weekB] = b.split('-W').map(Number);
        if (yearA !== yearB) return yearB - yearA; // Sort by year descending
        return weekB - weekA; // Then by week descending
    });

    const itemsToDisplay = showAllWeeklyFlag ? allWeekKeys : allWeekKeys.slice(0, DEFAULT_DISPLAY_LIMIT);

    if (itemsToDisplay.length === 0) {
        weeklyFinancialSummaryDiv.innerHTML = '<p class="no-data-message">No weekly financial summary to display for the selected filters.</p>';
        document.getElementById('showMoreWeekly').style.display = 'none';
        return;
    }

    itemsToDisplay.forEach(weekKey => {
        const income = weeklyIncomeMap[weekKey] || 0;
        const expense = weeklyExpenseMap[weekKey] || 0;
        const balance = income - expense;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'weekly-summary-item';
        itemDiv.innerHTML = `
            <span class="week-info">Week ${weekKey.split('-W')[1]}, ${weekKey.split('-W')[0]}:</span>
            <div class="weekly-amounts">
                <span class="weekly-income">Income: GHS ${income.toFixed(2)}</span>
                <span class="weekly-expense">Expenses: GHS ${expense.toFixed(2)}</span>
                <span class="weekly-balance">Balance: GHS ${balance.toFixed(2)}</span>
            </div>
        `;
        weeklyFinancialSummaryDiv.appendChild(itemDiv);
    });

    document.getElementById('showMoreWeekly').style.display = allWeekKeys.length > DEFAULT_DISPLAY_LIMIT ? 'block' : 'none';
    document.getElementById('showMoreWeekly').textContent = showAllWeeklyFlag ? 'Show Less Weekly Summaries' : `Show All Weekly Summaries (${allWeekKeys.length - DEFAULT_DISPLAY_LIMIT} more)`;
}


function renderPlanned(filteredPlanned) {
    const plannedListDiv = document.getElementById('plannedList');
    plannedListDiv.innerHTML = ''; // Clear previous entries

    // Sort by date ascending for planned purchases
    filteredPlanned.sort((a, b) => new Date(a.date) - new Date(b.date));

    const itemsToDisplay = showAllPlannedFlag ? filteredPlanned : filteredPlanned.slice(0, DEFAULT_DISPLAY_LIMIT);


    if (itemsToDisplay.length === 0) {
        plannedListDiv.innerHTML = '<p class="no-data-message">No planned purchases to display for the selected filters.</p>';
        document.getElementById('showMorePlanned').style.display = 'none';
        return;
    }

    itemsToDisplay.forEach(plan => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'entry-item planned-item';
        itemDiv.innerHTML = `
            <div>
                <strong>${plan.name}</strong> - GHS ${plan.amount.toFixed(2)}
                <small>Category: ${plan.category} | Due: ${new Date(plan.date).toLocaleDateString()}</small>
                ${plan.note ? `<small>Note: ${plan.note}</small>` : ''}
            </div>
            <div class="item-actions">
                <button class="btn btn-small" onclick="markAsBought(${plan.id})"><i class="fas fa-check-circle"></i> Mark as Bought</button>
                <button class="btn btn-small" onclick="deleteTransaction(${plan.id}, 'planned')"><i class="fas fa-trash-alt"></i> Delete</button>
            </div>
        `;
        plannedListDiv.appendChild(itemDiv);
    });

    document.getElementById('showMorePlanned').style.display = filteredPlanned.length > DEFAULT_DISPLAY_LIMIT ? 'block' : 'none';
    document.getElementById('showMorePlanned').textContent = showAllPlannedFlag ? 'Show Less Planned Items' : `Show All Planned Items (${filteredPlanned.length - DEFAULT_DISPLAY_LIMIT} more)`;
}

function showAllItems(sectionId) {
    if (sectionId === 'expenseHistory') {
        showAllExpensesFlag = !showAllExpensesFlag;
    } else if (sectionId === 'dailySpendingSummary') {
        showAllDailyFlag = !showAllDailyFlag;
    } else if (sectionId === 'weeklyFinancialSummary') {
        showAllWeeklyFlag = !showAllWeeklyFlag;
    } else if (sectionId === 'plannedList') {
        showAllPlannedFlag = !showAllPlannedFlag;
    }
    applyFiltersAndRender();
}


// --- Filtering Logic ---
function getFilteredData() {
    const filterCategory = document.getElementById('filterCategory').value;
    const filterYear = document.getElementById('filterYear').value;
    const filterMonth = document.getElementById('filterMonth').value;
    const filterDate = document.getElementById('filterDate').value;
    const filterAllDays = document.getElementById('filterAllDays').checked; // NEW: Get checkbox state

    const filteredExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        const matchCategory = filterCategory === 'all' || exp.category === filterCategory;
        const matchYear = filterYear === 'all' || expDate.getFullYear().toString() === filterYear;
        // Month filter: filterMonth is a string '0'-'11', getMonth() returns 0-11
        const matchMonth = filterMonth === 'all' || expDate.getMonth().toString() === filterMonth;
        // MODIFIED: If filterAllDays is checked, ignore specific date filter
        const matchDate = filterAllDays || filterDate === '' || exp.date === filterDate;

        return matchCategory && matchYear && matchMonth && matchDate;
    });

    const filteredIncomes = incomes.filter(inc => {
        const incDate = new Date(inc.date);
        const matchYear = filterYear === 'all' || incDate.getFullYear().toString() === filterYear;
        const matchMonth = filterMonth === 'all' || incDate.getMonth().toString() === filterMonth;
        // MODIFIED: If filterAllDays is checked, ignore specific date filter
        const matchDate = filterAllDays || filterDate === '' || inc.date === filterDate;
        return matchYear && matchMonth && matchDate;
    });

    const filteredPlanned = planned.filter(plan => {
        const planDate = new Date(plan.date);
        const matchCategory = filterCategory === 'all' || plan.category === filterCategory;
        const matchYear = filterYear === 'all' || planDate.getFullYear().toString() === filterYear;
        const matchMonth = filterMonth === 'all' || planDate.getMonth().toString() === filterMonth;
        // MODIFIED: If filterAllDays is checked, ignore specific date filter
        const matchDate = filterAllDays || filterDate === '' || plan.date === filterDate;
        return matchCategory && matchYear && matchMonth && matchDate;
    });

    return { filteredIncomes, filteredExpenses, filteredPlanned };
}

function applyFiltersAndRender() {
    const { filteredIncomes, filteredExpenses, filteredPlanned } = getFilteredData();

    renderHistory(filteredExpenses);
    renderDailySummary(filteredExpenses);
    renderWeeklySummary(filteredIncomes, filteredExpenses);
    renderPlanned(filteredPlanned);

    updateCharts(); // Re-render charts with filtered data
}

// NEW: Function to toggle the specific date input based on "Show All Days" checkbox
function toggleSpecificDateFilter() {
    const filterDateInput = document.getElementById('filterDate');
    const filterAllDaysCheckbox = document.getElementById('filterAllDays');

    if (filterAllDaysCheckbox.checked) {
        filterDateInput.value = ''; // Clear specific date
        filterDateInput.disabled = true; // Disable input
    } else {
        filterDateInput.disabled = false; // Enable input
        // Optionally set to today's date if enabling, but user might have a preference
        // filterDateInput.valueAsDate = new Date();
    }
    applyFiltersAndRender(); // Re-apply filters after state change
}

// MODIFIED: resetFilters to include today's date and default sort
function resetFilters() {
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterYear').value = 'all'; // Default Year Filter to 'all' on reset
    document.getElementById('filterMonth').value = 'all'; // Default Month Filter to 'all' on reset

    // NEW: Set "Show All Days" to unchecked and specific date to today
    document.getElementById('filterAllDays').checked = false;
    document.getElementById('filterDate').value = new Date().toISOString().split('T')[0]; // Set to today's date by default
    document.getElementById('filterDate').disabled = false; // Ensure it's enabled


    showAllExpensesFlag = false;
    showAllDailyFlag = false;
    showAllWeeklyFlag = false;
    showAllPlannedFlag = false;

    // Reset sorting to default
    currentSortBy = 'date';
    currentSortOrder = 'desc';
    const sortExpenseByElement = document.getElementById('sortExpenseBy');
    const sortExpenseOrderElement = document.getElementById('sortExpenseOrder');
    if (sortExpenseByElement) sortExpenseByElement.value = currentSortBy;
    if (sortExpenseOrderElement) sortExpenseOrderElement.value = currentSortOrder;

    applyFiltersAndRender();
}


// --- Dynamic Filter Options (Years) ---
function populateYearFilter() {
    const yearSelect = document.getElementById('filterYear');
    yearSelect.innerHTML = '<option value="all">All Years</option>'; // Keep "All Years" option

    const currentYear = new Date().getFullYear();
    const startYear = 2025; // User requested start year
    const endYear = 2030;   // User requested end year

    for (let year = endYear; year >= startYear; year--) { // Populate descending
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year.toString();
        yearSelect.appendChild(option);
    }
    // Select the current year by default if it's within the defined range
    if (currentYear >= startYear && currentYear <= endYear) {
        yearSelect.value = currentYear.toString();
    } else {
        yearSelect.value = 'all'; // Fallback to 'All Years'
    }
}


// --- Chart Functions ---
function updateCharts() {
    const { filteredIncomes, filteredExpenses } = getFilteredData();
    const isMobile = window.innerWidth <= 768;

    // Destroy all existing chart instances to prevent memory leaks and allow re-rendering
    if (categoryChartDesktopInstance) { categoryChartDesktopInstance.destroy(); categoryChartDesktopInstance = null; }
    if (monthlyChartDesktopInstance) { monthlyChartDesktopInstance.destroy(); monthlyChartDesktopInstance = null; }
    if (weeklySpendingChartDesktopInstance) { weeklySpendingChartDesktopInstance.destroy(); weeklySpendingChartDesktopInstance = null; }

    if (categoryChartMobileInstance) { categoryChartMobileInstance.destroy(); categoryChartMobileInstance = null; }
    if (monthlyChartMobileInstance) { monthlyChartMobileInstance.destroy(); monthlyChartMobileInstance = null; }
    if (weeklySpendingChartMobileInstance) { weeklySpendingChartMobileInstance.destroy(); weeklySpendingChartMobileInstance = null; }


    // Get the correct canvas and no-data message elements based on device
    const categoryCanvas = document.getElementById(isMobile ? 'categoryChartMobileCanvas' : 'categoryChartCanvas');
    const monthlyCanvas = document.getElementById(isMobile ? 'monthlyChartMobileCanvas' : 'monthlyChartCanvas');
    const weeklySpendingCanvas = document.getElementById(isMobile ? 'weeklySpendingChartMobileCanvas' : 'weeklySpendingChartCanvas');

    const noCategoryChartData = document.getElementById(isMobile ? 'noCategoryChartDataMobile' : 'noCategoryChartData');
    const noMonthlyChartData = document.getElementById(isMobile ? 'noMonthlyChartDataMobile' : 'noMonthlyChartData');
    const noWeeklySpendingChartData = document.getElementById(isMobile ? 'noWeeklySpendingChartDataMobile' : 'noWeeklySpendingChartData');


    // --- Category Spending Chart ---
    const categorySpending = {};
    filteredExpenses.forEach(exp => {
        if (!categorySpending[exp.category]) {
            categorySpending[exp.category] = 0;
        }
        categorySpending[exp.category] += exp.amount;
    });

    const categoryLabels = Object.keys(categorySpending);
    const categoryData = Object.values(categorySpending);

    if (categoryData.length === 0) {
        if (categoryCanvas) categoryCanvas.style.display = 'none';
        if (noCategoryChartData) noCategoryChartData.style.display = 'flex';
    } else {
        if (categoryCanvas) categoryCanvas.style.display = 'block';
        if (noCategoryChartData) noCategoryChartData.style.display = 'none';

        if (categoryCanvas) { // Ensure canvas exists before trying to get context
            const ctx = categoryCanvas.getContext('2d');
            const chartInstance = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: categoryLabels,
                    datasets: [{
                        data: categoryData,
                        backgroundColor: [
                            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9900',
                            '#C9CBCF', '#A2CCB6', '#E9F1DF', '#C0C0C0', '#808080', '#D3D3D3',
                            '#8A2BE2', '#DEB887', '#5F9EA0', '#7FFF00', '#D2691E'
                        ],
                        hoverOffset: 8 // Slight hover effect
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // Allow chart to fit fixed height
                    plugins: {
                        legend: {
                            position: isMobile ? 'bottom' : 'right', // Legend at bottom for mobile
                            labels: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color-dark'),
                                font: {
                                    size: isMobile ? 10 : 12 // Smaller font on mobile
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed !== null) {
                                        label += 'GHS ' + context.parsed.toFixed(2);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    cutout: '70%',
                }
            });
            if (isMobile) categoryChartMobileInstance = chartInstance;
            else categoryChartDesktopInstance = chartInstance;
        }
    }

    // --- Monthly Income vs. Expenses Chart ---
    const monthlyIncome = {};
    const monthlyExpenses = {};

    filteredIncomes.forEach(inc => {
        const monthKey = getMonthKey(inc.date);
        if (!monthlyIncome[monthKey]) {
            monthlyIncome[monthKey] = 0;
        }
        monthlyIncome[monthKey] += inc.amount;
    });

    filteredExpenses.forEach(exp => {
        const monthKey = getMonthKey(exp.date);
        if (!monthlyExpenses[monthKey]) {
            monthlyExpenses[monthKey] = 0;
        }
        monthlyExpenses[monthKey] += exp.amount;
    });

    const allMonthKeys = Array.from(new Set([...Object.keys(monthlyIncome), ...Object.keys(monthlyExpenses)]));
    allMonthKeys.sort(); // Sort chronologically

    const monthlyLabels = allMonthKeys.map(key => {
        const [year, month] = key.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    });

    const incomeData = allMonthKeys.map(key => monthlyIncome[key] || 0);
    const expenseData = allMonthKeys.map(key => monthlyExpenses[key] || 0);

    if (allMonthKeys.length === 0) {
        if (monthlyCanvas) monthlyCanvas.style.display = 'none';
        if (noMonthlyChartData) noMonthlyChartData.style.display = 'flex';
    } else {
        if (monthlyCanvas) monthlyCanvas.style.display = 'block';
        if (noMonthlyChartData) noMonthlyChartData.style.display = 'none';

        if (monthlyCanvas) {
            const ctx = monthlyCanvas.getContext('2d');
            const chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: monthlyLabels,
                    datasets: [
                        {
                            label: 'Income',
                            data: incomeData,
                            backgroundColor: getComputedStyle(document.body).getPropertyValue('--primary-color'),
                            borderColor: getComputedStyle(document.body).getPropertyValue('--primary-color'),
                            borderWidth: 1
                        },
                        {
                            label: 'Expenses',
                            data: expenseData,
                            backgroundColor: getComputedStyle(document.body).getPropertyValue('--danger-color'),
                            borderColor: getComputedStyle(document.body).getPropertyValue('--danger-color'),
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // Allow chart to fit fixed height
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color-dark'),
                                font: {
                                    size: isMobile ? 10 : 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += 'GHS ' + context.parsed.y.toFixed(2);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color-light'),
                                font: {
                                    size: isMobile ? 9 : 11
                                }
                            },
                            grid: {
                                color: getComputedStyle(document.body).getPropertyValue('--border-color')
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color-light'),
                                font: {
                                    size: isMobile ? 9 : 11
                                }
                            },
                            grid: {
                                color: getComputedStyle(document.body).getPropertyValue('--border-color')
                            }
                        }
                    }
                }
            });
            if (isMobile) monthlyChartMobileInstance = chartInstance;
            else monthlyChartDesktopInstance = chartInstance;
        }
    }

    // --- Weekly Spending Trend Chart ---
    const weeklySpending = {};

    filteredExpenses.forEach(exp => {
        const weekKey = getWeekKey(exp.date);
        if (!weeklySpending[weekKey]) {
            weeklySpending[weekKey] = 0;
        }
        weeklySpending[weekKey] += exp.amount;
    });

    const sortedWeekKeys = Object.keys(weeklySpending).sort(); // Sort chronologically

    const weeklyLabels = sortedWeekKeys.map(key => {
        const [year, weekNum] = key.split('-W');
        return `W${parseInt(weekNum)} '${year.slice(2)}`;
    });
    const weeklyData = sortedWeekKeys.map(key => weeklySpending[key]);

    if (weeklyData.length === 0) {
        if (weeklySpendingCanvas) weeklySpendingCanvas.style.display = 'none';
        if (noWeeklySpendingChartData) noWeeklySpendingChartData.style.display = 'flex';
    } else {
        if (weeklySpendingCanvas) weeklySpendingCanvas.style.display = 'block';
        if (noWeeklySpendingChartData) noWeeklySpendingChartData.style.display = 'none';

        if (weeklySpendingCanvas) {
            const ctx = weeklySpendingCanvas.getContext('2d');
            const chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: weeklyLabels,
                    datasets: [{
                        label: 'Weekly Spending',
                        data: weeklyData,
                        borderColor: getComputedStyle(document.body).getPropertyValue('--danger-color'),
                        backgroundColor: 'rgba(244, 67, 54, 0.2)', // Light red fill
                        tension: 0.3, // Makes the line curved
                        fill: true,
                        pointBackgroundColor: getComputedStyle(document.body).getPropertyValue('--danger-color'),
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: getComputedStyle(document.body).getPropertyValue('--danger-color'),
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // Allow chart to fit fixed height
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color-dark'),
                                font: {
                                    size: isMobile ? 10 : 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += 'GHS ' + context.parsed.y.toFixed(2);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color-light'),
                                font: {
                                    size: isMobile ? 9 : 11
                                }
                            },
                            grid: {
                                color: getComputedStyle(document.body).getPropertyValue('--border-color')
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color-light'),
                                font: {
                                    size: isMobile ? 9 : 11
                                }
                            },
                            grid: {
                                color: getComputedStyle(document.body).getPropertyValue('--border-color')
                            }
                        }
                    }
                }
            });
            if (isMobile) weeklySpendingChartMobileInstance = chartInstance;
            else weeklySpendingChartDesktopInstance = chartInstance;
        }
    }
}


// --- PDF Export Functionality ---
function exportPDF() {
    const { filteredIncomes, filteredExpenses, filteredPlanned } = getFilteredData();

    // Check if there's any data to export
    if (filteredIncomes.length === 0 && filteredExpenses.length === 0 && filteredPlanned.length === 0) {
        alert("No data to export with the current filters. Please add some transactions or adjust filters.");
        return;
    }

    const doc = new jsPDF();
    let y = 20; // Starting Y position

    doc.setFontSize(18);
    doc.setTextColor('#333333');
    doc.text("Financial Summary Report", doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(10);
    doc.setTextColor('#555555');
    doc.text(`Generated on: ${new Date().toLocaleString()}`, doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += 15; // Space after header

    // Overall Summary
    const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0); // Use ALL incomes for overall
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0); // Use ALL expenses for overall
    const overallBalance = totalIncome - totalExpenses;

    doc.setFontSize(14);
    doc.setTextColor('#4CAF50'); // Primary color
    doc.text(`--- Overall Summary ---`, 10, y); y += 10;
    doc.setFontSize(10);
    doc.setTextColor('#333333');
    doc.text(`Total Income: GHS ${totalIncome.toFixed(2)}`, 10, y); y += 7;
    doc.text(`Total Expenses: GHS ${totalExpenses.toFixed(2)}`, 10, y); y += 7;
    doc.text(`Net Balance: GHS ${overallBalance.toFixed(2)}`, 10, y); y += 15;


    // Expense Details Table
    if (filteredExpenses.length > 0) {
        // Add new page if content will overflow
        if (y + 50 > doc.internal.pageSize.height) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setTextColor('#F44336'); // Danger color
        doc.text(`--- Expense Details ---`, 10, y); y += 10;
        doc.setFontSize(10);
        doc.setTextColor('#333333');

        const expenseTableData = filteredExpenses.map(exp => [
            exp.date,
            exp.name,
            exp.category,
            exp.amount.toFixed(2),
            exp.note || ''
        ]);

        doc.autoTable({
            startY: y,
            head: [['Date', 'Item Name', 'Category', 'Amount (GHS)', 'Note']],
            body: expenseTableData,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', textColor: '#333333' },
            headStyles: { fillColor: [244, 67, 54], textColor: 255, fontStyle: 'bold' }, // Danger color for header
            margin: { top: 10, bottom: 10, left: 10, right: 10 },
            didDrawPage: function(data) {
                let str = "Page " + doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor('#555555');
                doc.text(str, doc.internal.pageSize.width - 15, doc.internal.pageSize.height - 10, null, null, "right");
            }
        });
        y = doc.autoTable.previous.finalY + 15;
    }

    // Monthly Breakdown Table
    const monthlyIncome = {};
    const monthlyExpenses = {};

    filteredIncomes.forEach(inc => {
        const monthKey = getMonthKey(inc.date);
        if (!monthlyIncome[monthKey]) monthlyIncome[monthKey] = 0;
        monthlyIncome[monthKey] += inc.amount;
    });
    filteredExpenses.forEach(exp => {
        const monthKey = getMonthKey(exp.date);
        if (!monthlyExpenses[monthKey]) monthlyExpenses[monthKey] = 0;
        monthlyExpenses[monthKey] += exp.amount;
    });

    const allMonthKeys = Array.from(new Set([...Object.keys(monthlyIncome), ...Object.keys(monthlyExpenses)]));
    allMonthKeys.sort(); // Sort chronologically

    if (allMonthKeys.length > 0) {
        if (y + 50 > doc.internal.pageSize.height) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setTextColor('#2196F3'); // Secondary color
        doc.text(`--- Monthly Breakdown ---`, 10, y); y += 10;
        doc.setFontSize(10);
        doc.setTextColor('#333333');

        const monthlyTableData = allMonthKeys.map(key => {
            const [year, month] = key.split('-');
            const date = new Date(year, parseInt(month) - 1, 1);
            const monthLabel = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
            const income = monthlyIncome[key] || 0;
            const expense = monthlyExpenses[key] || 0;
            const balance = income - expense;
            return [monthLabel, income.toFixed(2), expense.toFixed(2), balance.toFixed(2)];
        });

        doc.autoTable({
            startY: y,
            head: [['Month', 'Income (GHS)', 'Expenses (GHS)', 'Balance (GHS)']],
            body: monthlyTableData,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', textColor: '#333333' },
            headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold' }, // Secondary color for header
            margin: { top: 10, bottom: 10, left: 10, right: 10 },
            didDrawPage: function(data) {
                let str = "Page " + doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor('#555555');
                doc.text(str, doc.internal.pageSize.width - 15, doc.internal.pageSize.height - 10, null, null, "right");
            }
        });
        y = doc.autoTable.previous.finalY + 15;
    }

    // Category Spending Breakdown
    const categorySpending = {};
    filteredExpenses.forEach(exp => {
        if (!categorySpending[exp.category]) categorySpending[exp.category] = 0;
        categorySpending[exp.category] += exp.amount;
    });

    const categoryLabels = Object.keys(categorySpending);
    const categoryData = Object.values(categorySpending);

    if (categoryLabels.length > 0) {
        if (y + 50 > doc.internal.pageSize.height) { doc.addPage(); y = 20; }
        doc.setFontSize(14);
        doc.setTextColor('#FFC107'); // Accent color
        doc.text(`--- Spending by Category ---`, 10, y); y += 10;
        doc.setFontSize(10);
        doc.setTextColor('#333333');

        const categoryTableData = categoryLabels.map(category => [
            category,
            categorySpending[category].toFixed(2)
        ]);

        doc.autoTable({
            startY: y,
            head: [['Category', 'Amount Spent (GHS)']],
            body: categoryTableData,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', textColor: '#333333' },
            headStyles: { fillColor: [255, 193, 7], textColor: 255, fontStyle: 'bold' }, // Accent color for header
            margin: { top: 10, bottom: 10, left: 10, right: 10 },
            didDrawPage: function(data) {
                let str = "Page " + doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor('#555555');
                doc.text(str, doc.internal.pageSize.width - 15, doc.internal.pageSize.height - 10, null, null, "right");
            }
        });
    }

    doc.save("financial_summary_report.pdf");
}

function exportCSV() {
    const { filteredIncomes, filteredExpenses, filteredPlanned } = getFilteredData();

    // Check if there's any data to export
    if (filteredIncomes.length === 0 && filteredExpenses.length === 0 && filteredPlanned.length === 0) {
        alert("No data to export with the current filters. Please add some transactions or adjust filters.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Date,Name/Note,Category,Amount (GHS)\n"; // Headers

    // Add incomes
    filteredIncomes.forEach(item => {
        csvContent += `Income,${item.date},"${(item.note || '').replace(/"/g, '""')}",N/A,${item.amount.toFixed(2)}\n`;
    });

    // Add expenses
    filteredExpenses.forEach(item => {
        csvContent += `Expense,${item.date},"${item.name.replace(/"/g, '""')}",${item.category},-${item.amount.toFixed(2)}\n`; // Negative for expenses
    });

    // Add planned purchases
    filteredPlanned.forEach(item => {
        csvContent += `Planned,${item.date},"${item.name.replace(/"/g, '""')}",${item.category},${item.amount.toFixed(2)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "budget_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


function exportChartsToPDF() {
    // Check if there's any data for charts
    const { filteredIncomes, filteredExpenses } = getFilteredData();
    const hasExpenseData = filteredExpenses.length > 0;
    const hasIncomeOrExpenseData = filteredIncomes.length > 0 || filteredExpenses.length > 0;

    if (!hasExpenseData && !hasIncomeOrExpenseData) {
        alert("No data available to generate charts PDF. Please add some transactions or adjust filters.");
        return;
    }

    const doc = new jsPDF({
        orientation: 'landscape', // Landscape for charts
        unit: 'pt',
        format: [800, 600] // Custom size, adjust as needed
    });
    let y = 30;

    doc.setFontSize(18);
    doc.setTextColor('#333333');
    doc.text("Budget Charts Overview", doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += 30;

    // Helper to add a chart to PDF
    const addChartToPDF = (canvasId, title) => {
        const canvasElement = document.getElementById(canvasId);

        // Ensure chart data exists before attempting to capture
        // Chart.js stores chart object on canvas element as 'chart' property
        if (!canvasElement || !canvasElement.chart || canvasElement.chart.data.labels.length === 0) {
            doc.setFontSize(12);
            doc.setTextColor('#555555');
            doc.text(`${title}: No data to display.`, doc.internal.pageSize.width / 2, y + 100, { align: 'center' });
            y += 200; // Move Y down to make space for the next chart/message
            return;
        }

        const imgData = canvasElement.toDataURL('image/png');
        const imgWidth = 700;
        const imgHeight = (canvasElement.height * imgWidth) / canvasElement.width;

        if (y + imgHeight + 50 > doc.internal.pageSize.height) { // Check if new page is needed
            doc.addPage();
            y = 30;
        }

        doc.setFontSize(14);
        doc.setTextColor('#4CAF50'); // Primary color for chart titles
        doc.text(title, doc.internal.pageSize.width / 2, y, { align: 'center' });
        y += 10; // Space for title

        doc.addImage(imgData, 'PNG', (doc.internal.pageSize.width - imgWidth) / 2, y, imgWidth, imgHeight);
        y += imgHeight + 30; // Space after chart
    };

    // Store original display states and force show all chart containers for capture
    const allChartContainers = document.querySelectorAll('.charts-section > .chart-container'); // Desktop containers
    const allMobileChartTabContents = document.querySelectorAll('.charts-section .chart-tab-content'); // Mobile tab content divs

    const originalDesktopDisplays = {};
    allChartContainers.forEach(container => {
        originalDesktopDisplays[container.id] = container.style.display;
        container.style.display = 'flex'; // Make visible temporarily (flex for its children sizing)
        const canvas = container.querySelector('canvas');
        const noData = container.querySelector('.no-data-message');
        if (canvas) canvas.style.display = 'block';
        if (noData) noData.style.display = 'none'; // Hide no data msg for capture
    });

    const originalMobileDisplays = {};
    allMobileChartTabContents.forEach(container => {
        originalMobileDisplays[container.id] = container.style.display;
        container.style.display = 'flex'; // Make visible temporarily
        const canvas = container.querySelector('canvas');
        const noData = container.querySelector('.no-data-message');
        if (canvas) canvas.style.display = 'block';
        if (noData) noData.style.display = 'none'; // Hide no data msg for capture
    });

    // Re-render charts to ensure they are drawn on now-visible canvases before capture
    updateCharts();

    // Add charts to PDF - use the specific canvas IDs for capture
    // Prioritize desktop canvases if they are theoretically rendered (based on current screen size)
    // Fallback to mobile canvases if desktop ones are hidden by media queries
    const isMobileView = window.innerWidth <= 768;

    // Capture Category Chart
    if (isMobileView) addChartToPDF('categoryChartMobileCanvas', 'Category Spending Distribution');
    else addChartToPDF('categoryChartCanvas', 'Category Spending Distribution');

    // Capture Monthly Chart
    if (isMobileView) addChartToPDF('monthlyChartMobileCanvas', 'Monthly Income vs. Expenses Comparison');
    else addChartToPDF('monthlyChartCanvas', 'Monthly Income vs. Expenses Comparison');

    // Capture Weekly Spending Chart
    if (isMobileView) addChartToPDF('weeklySpendingChartMobileCanvas', 'Weekly Spending Trend');
    else addChartToPDF('weeklySpendingChartCanvas', 'Weekly Spending Trend');


    // Restore original display states for desktop containers
    allChartContainers.forEach(container => {
        container.style.display = originalDesktopDisplays[container.id];
    });

    // Restore original display states for mobile tab contents and hide them
    allMobileChartTabContents.forEach(container => {
        container.style.display = originalMobileDisplays[container.id];
    });


    // If on mobile, re-activate the currently selected tab content to restore UI state
    if (window.innerWidth <= 768) {
        const activeTabButton = document.querySelector('.chart-tabs .tab-button.active');
        if (activeTabButton) {
            const chartId = activeTabButton.getAttribute('onclick').match(/'(.*?)'/)[1]; // e.g., 'categoryChartTab'
            document.getElementById(chartId).style.display = 'flex';
        } else {
             // If no tab is active (e.g., first load), activate the first one
             document.querySelector('.chart-tabs .tab-button').click();
        }
    }

    doc.save("budget_charts.pdf");
}


// --- Dark Mode Toggle ---
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);

    const darkModeIcon = document.getElementById('dark-mode-icon');
    const darkModeText = document.getElementById('dark-mode-text');
    if (isDarkMode) {
        darkModeIcon.textContent = '☀️';
        darkModeText.textContent = 'Light Mode';
    } else {
        darkModeIcon.textContent = '🌙';
        darkModeText.textContent = 'Dark Mode';
    }
    updateCharts(); // Re-render charts to apply new theme colors
}


// --- Function to open a specific chart tab for mobile ---
function openChartTab(evt, chartId) {
    // Declare all variables
    let i, tabcontent, tabbuttons;

    // Get all elements with class="chart-tab-content" and hide them
    tabcontent = document.getElementsByClassName("chart-tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class="tab-button" and remove the class "active"
    tabbuttons = document.getElementsByClassName("tab-button");
    for (i = 0; i < tabbuttons.length; i++) {
        tabbuttons[i].className = tabbuttons[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(chartId).style.display = "flex"; // Use flex to center content
    evt.currentTarget.className += " active";

    // Call updateCharts to ensure the displayed chart re-renders correctly after being hidden/shown
    // This is important for Chart.js to draw correctly on a visible canvas
    updateCharts();
}


// --- Initial Load / Update All ---
function updateAllDisplays() {
    populateYearFilter();
    updateDashboard();
    applyFiltersAndRender();
}

window.onload = () => {
    // Apply dark mode preference on load
    if (localStorage.getItem("darkMode") === "true") {
        document.body.classList.add("dark-mode");
        document.getElementById("dark-mode-icon").textContent = "☀️";
        document.getElementById("dark-mode-text").textContent = "Light Mode";
    }

    // NEW: Set filterDate to today's date for default view on load
    // This ensures that "Today's log" is shown by default
    document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('filterAllDays').checked = false; // Ensure "Show All Days" is unchecked by default
    document.getElementById('filterDate').disabled = false; // Ensure specific date input is enabled

    // Initialize sorting dropdowns with default values if they exist
    const sortExpenseByElement = document.getElementById('sortExpenseBy');
    const sortExpenseOrderElement = document.getElementById('sortExpenseOrder');
    if (sortExpenseByElement) sortExpenseByElement.value = currentSortBy;
    if (sortExpenseOrderElement) sortExpenseOrderElement.value = currentSortOrder;

    handleInitialLayout(); // Handles responsive display logic
    updateAllDisplays(); // Initial UI update for everything (dashboard, lists, charts)
};

// Handle layout changes on resize
window.addEventListener('resize', handleInitialLayout);

function handleInitialLayout() {
    const isMobile = window.innerWidth <= 768;

    // Dashboard cards: Show only first 3, others hidden by default on mobile
    const moreDashboardCardsDiv = document.getElementById('moreDashboardCards');
    const toggleDashboardBtn = document.querySelector('.toggle-dashboard-btn');
    if (isMobile) {
        moreDashboardCardsDiv.style.display = 'none';
        toggleDashboardBtn.innerHTML = 'Show More Balances <i class="fas fa-chevron-down"></i>';
        toggleDashboardBtn.style.display = 'block';
        moreDashboardCardsVisibleMobile = false;
    } else {
        moreDashboardCardsDiv.style.display = 'grid'; // Ensure it's visible and acts as grid on desktop
        toggleDashboardBtn.style.display = 'none'; // Hide toggle button on desktop
        moreDashboardCardsVisibleMobile = true;
    }

    // Filters: Hidden by default on mobile
    const filterCollapseContent = document.getElementById('filterCollapseContent');
    const toggleFiltersBtn = document.querySelector('.toggle-filters-btn');
    if (isMobile) {
        filterCollapseContent.style.display = 'none';
        toggleFiltersBtn.innerHTML = 'Show Filters <i class="fas fa-chevron-down"></i>';
        toggleFiltersBtn.style.display = 'block';
        filtersVisibleMobile = false;
    } else {
        filterCollapseContent.style.display = 'flex'; // Ensure it's visible and acts as flex on desktop
        toggleFiltersBtn.style.display = 'none'; // Hide toggle button on desktop
        filtersVisibleMobile = true;
    }

    // Export/Reset Actions: Hidden by default on mobile, shown via modal
    const desktopActionsGroup = document.getElementById('desktopActionsGroup');
    const toggleMobileActionsBtn = document.querySelector('.toggle-mobile-actions-btn');
    if (isMobile) {
        desktopActionsGroup.style.display = 'none';
        toggleMobileActionsBtn.style.display = 'block';
    } else {
        desktopActionsGroup.style.display = 'flex'; // Ensure it's visible and acts as flex on desktop
        toggleMobileActionsBtn.style.display = 'none';
    }


    // Chart Tabs: Handle initial display for charts based on screen size
    const desktopChartContainers = document.querySelectorAll('.charts-section > .chart-container');
    const mobileChartTabContents = document.querySelectorAll('.charts-section .chart-tab-content');
    const chartTabsDiv = document.querySelector('.chart-tabs');
    const firstTabButton = document.querySelector('.chart-tabs .tab-button');

    if (isMobile) {
        chartTabsDiv.style.display = 'flex'; // Show tabs on mobile
        desktopChartContainers.forEach(container => container.style.display = 'none'); // Hide desktop containers
        // Ensure only one mobile tab content is visible (the first one initially)
        mobileChartTabContents.forEach((content, index) => {
            if (index === 0) { // First tab content
                content.style.display = 'flex'; // Show
                if (firstTabButton) firstTabButton.classList.add('active'); // Activate its button
            } else {
                content.style.display = 'none'; // Hide others
            }
        });
    } else {
        chartTabsDiv.style.display = 'none'; // Hide tabs on desktop
        desktopChartContainers.forEach(container => container.style.display = 'flex'); // Show desktop containers
        mobileChartTabContents.forEach(container => container.style.display = 'none'); // Hide mobile tab content divs on desktop
        // Remove active class from mobile tab buttons
        const allTabButtons = document.querySelectorAll('.chart-tabs .tab-button');
        allTabButtons.forEach(button => button.classList.remove('active'));
    }
    // Crucial: Call updateCharts *after* display properties are set by handleInitialLayout
    updateCharts();
}


// Add event listeners for filters
document.getElementById('filterCategory').addEventListener('change', applyFiltersAndRender);
document.getElementById('filterYear').addEventListener('change', applyFiltersAndRender);
document.getElementById('filterMonth').addEventListener('change', applyFiltersAndRender);
// NEW: Add event listener for specific date filter and the new "Show All Days" checkbox
document.getElementById('filterDate').addEventListener('change', applyFiltersAndRender);
document.getElementById('filterAllDays').addEventListener('change', toggleSpecificDateFilter);


// Allow closing modals by clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal') && event.target.id !== 'mobileActionsModal') {
        // Only close if it's a general modal, not the mobile actions modal
        event.target.style.display = 'none';
        document.body.classList.remove('modal-open');
    } else if (event.target.classList.contains('modal') && event.target.id === 'mobileActionsModal') {
        // For mobile actions modal, close it explicitly
        closeModal('mobileActionsModal');
    }
}

// Close modals with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.style.display === 'flex') {
                closeModal(modal.id); // Use the existing closeModal function
            }
        });
    }
});