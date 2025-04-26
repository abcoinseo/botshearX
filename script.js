// Firebase Config (keep as is)
const firebaseConfig = {
    apiKey: "AIzaSyBW1WPXUN8DYhT6npZQYoQ3l4J-jFSbzfg",
    authDomain: "ab-studio-marketcap.firebaseapp.com",
    databaseURL: "https://ab-studio-marketcap-default-rtdb.firebaseio.com",
    projectId: "ab-studio-marketcap",
    storageBucket: "ab-studio-marketcap.firebasestorage.app",
    messagingSenderId: "115268088088",
    appId: "1:115268088088:web:65643a047f92bfaa66ee6d"
};

// --- Global Variables ---
let tg = window.Telegram.WebApp;
let db;
let currentUser = null;
let userProfile = { points: 0, likedBots: {}, username: 'N/A' }; // Ensure username default
let allBots = {};
let currentBotList = [];
let currentOpenBotId = null;
let currentEditBotId = null;
let currentComments = {}; // Store comments for the open bot { commentId: commentData }
let commentListener = null; // Reference to the active comment listener
let chatMessagesListener = null; // Reference to chat listener
let adCooldown = false;
const LIKE_REWARD_POINTS = 10;
const AD_REWARD_POINTS = 10;
const AD_COOLDOWN_MS = 30 * 1000;
const CHAT_MESSAGES_LIMIT = 50; // Load last 50 chat messages

// --- DOM Elements ---
const loadingScreen = document.getElementById('loading-screen');
const errorMessage = document.getElementById('error-message');
const appContainer = document.getElementById('app'); // Reference to main app container
const pages = document.querySelectorAll('.page');
const navButtons = document.querySelectorAll('.nav-button:not(.add-button)');
const addBotNavButton = document.getElementById('add-bot-nav-button');
const botListContainer = document.getElementById('bot-list-container');
const searchInput = document.getElementById('search-input');
const tabButtons = document.querySelectorAll('.tab-button');
const profileName = document.getElementById('profile-name');
const profileUsername = document.getElementById('profile-username');
const profileChatId = document.getElementById('profile-chat-id');
const profilePoints = document.getElementById('profile-points');
const myBotsList = document.getElementById('my-bots-list');
const earnAdsFab = document.getElementById('earn-ads-fab'); // FAB earn button
const earnPointsProfileButton = document.getElementById('earn-points-profile-button'); // Profile earn button

// Popups & Forms
const addBotPopup = document.getElementById('add-bot-popup');
const boostPopup = document.getElementById('boost-popup');
const infoPopup = document.getElementById('info-popup');
const addBotForm = document.getElementById('add-bot-form');
const closePopupButtons = document.querySelectorAll('.close-popup, .cancel-button[data-popup]');
const boostOptions = document.querySelectorAll('.boost-option');
const boostStatus = document.getElementById('boost-status');
const boostBotIdInput = document.getElementById('boost-bot-id');
const infoPopupTitle = document.getElementById('info-popup-title');
const infoPopupMessage = document.getElementById('info-popup-message');

// Bot Detail Page Elements
const botDetailPage = document.getElementById('bot-detail-page');
const backToHomeButton = document.getElementById('back-to-home-button');
const detailBotName = document.getElementById('detail-bot-name');
const botDetailContent = document.getElementById('bot-detail-content');
const commentSection = document.getElementById('comment-section');
const commentCountSpan = document.getElementById('comment-count');
const addCommentForm = document.getElementById('add-comment-form');
const commentInput = document.getElementById('comment-input');
const commentList = document.getElementById('comment-list');
const replyToCommentIdInput = document.getElementById('reply-to-comment-id');
const replyingToIndicator = document.getElementById('replying-to-indicator');
const cancelReplyButton = document.getElementById('cancel-reply-button');

// Chat Page Elements
const chatPage = document.getElementById('chat-page');
const chatMessagesContainer = document.getElementById('chat-messages-container');
const chatMessageInput = document.getElementById('chat-message-input');
const sendChatMessageButton = document.getElementById('send-chat-message-button');
const togglePointTransferButton = document.getElementById('toggle-point-transfer-button');
const pointTransferUI = document.getElementById('point-transfer-ui');
const recipientIdInput = document.getElementById('recipient-id');
const transferAmountInput = document.getElementById('transfer-amount');
const sendPointsButton = document.getElementById('send-points-button');
const cancelTransferButton = document.getElementById('cancel-transfer-button');

// --- Initialization ---
function initializeApp() {
    tg.ready();
    tg.expand();
    // Set theme parameters for better integration (optional but recommended)
    tg.setHeaderColor('#1a1a1a'); // Match header background
    tg.setBackgroundColor('#0f0f0f'); // Match page background

    if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        showError("Please launch this app from Telegram.");
        // Optionally disable functionality or tg.close();
        return;
    }

    currentUser = tg.initDataUnsafe.user;
    console.log("Telegram User:", currentUser);

    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        console.log("Firebase Initialized");
        fetchInitialData();
    } catch (error) {
        console.error("Firebase Init Error:", error);
        showError("Failed to connect to the database.");
    }

    setupEventListeners();
    // Don't show home page immediately, wait for profile fetch
}

function showError(message) {
    pages.forEach(p => p.classList.remove('active-page')); // Hide all pages
    loadingScreen.classList.add('active-page');
    loadingScreen.querySelector('p').textContent = "Error";
    loadingScreen.querySelector('.spinner').style.display = 'none';
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    console.error(message);
     // Hide nav maybe?
     document.querySelector('.bottom-nav')?.classList.add('hidden');
}

// --- Utility Functions ---
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    if (num < 1000) return num.toString();
    const suffixes = ["", "K", "M", "B", "T"]; // Kilo, Million, Billion, Trillion
    const i = Math.floor(Math.log10(Math.abs(num)) / 3);
    if (i >= suffixes.length) i = suffixes.length - 1; // Handle very large numbers
    const shortNum = (num / Math.pow(1000, i));
    // Use 1 decimal place if not an integer, otherwise no decimals
    const formatted = shortNum % 1 === 0 ? shortNum.toFixed(0) : shortNum.toFixed(1);
    return formatted + suffixes[i];
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 1) {
        return date.toLocaleDateString();
    } else if (days === 1) {
         return 'Yesterday ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else if (hours > 0) {
        return `${hours}h ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return `Just now`;
    }
}


// --- Data Fetching ---
async function fetchInitialData() {
    if (!currentUser || !db) return;

    try {
        await fetchUserProfile(); // MUST wait for profile first
        listenForBots();
        listenForChatMessages(); // Start listening for chat messages
        showPage('home-page'); // Now show home page
        loadingScreen.classList.remove('active-page');
        document.querySelector('.bottom-nav')?.classList.remove('hidden');
    } catch (error) {
        showError("Failed to load initial data: " + error.message);
    }
}

async function fetchUserProfile() {
    const userRef = db.ref(`users/${currentUser.id}`);
    return new Promise(async (resolve, reject) => { // Wrap in promise
        try {
            const snapshot = await userRef.once('value');
            if (snapshot.exists()) {
                userProfile = { ...userProfile, ...snapshot.val() };
                if (!userProfile.likedBots || typeof userProfile.likedBots !== 'object') {
                    userProfile.likedBots = {};
                }
                 // Ensure username is stored locally if available
                userProfile.username = currentUser.username || snapshot.val().username || 'N/A';
                console.log("User profile loaded:", userProfile);
            } else {
                console.log("Creating new user profile");
                const newUserProfile = {
                    id: currentUser.id,
                    firstName: currentUser.first_name || '',
                    lastName: currentUser.last_name || '',
                    username: currentUser.username || 'N/A',
                    points: 0,
                    likedBots: {},
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                };
                await userRef.set(newUserProfile);
                userProfile = { ...userProfile, ...newUserProfile, points: 0, likedBots: {} }; // Update local state
            }
            updateProfileUI();
            resolve(); // Resolve the promise on success
        } catch (error) {
            console.error("Error fetching user profile:", error);
            reject(error); // Reject the promise on error
        }
    });
}

function listenForBots() {
    const botsRef = db.ref('bots');
    botsRef.orderByChild('createdAt').on('value', (snapshot) => {
        allBots = {};
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const botData = childSnapshot.val();
                if (botData) { // Fetch all, filter visibility later
                     allBots[childSnapshot.key] = {
                        id: childSnapshot.key,
                        ...botData,
                        likesCount: botData.likesCount || 0,
                        createdAt: botData.createdAt || 0,
                        boostEndDate: botData.boostEndDate || 0,
                        active: botData.active !== undefined ? botData.active : true
                    };
                }
            });
        }
        console.log("Bots updated:", Object.keys(allBots).length);
        displayBots(); // Update home list
        updateMyBotsList(); // Update profile list
        // If detail page is open, refresh its data (likes etc.)
        if (currentOpenBotId && allBots[currentOpenBotId]) {
             showBotDetails(currentOpenBotId, false); // Refresh without navigating
        }

    }, (error) => {
        console.error("Error listening for bots:", error);
        botListContainer.innerHTML = '<p class="placeholder">Error loading bots.</p>';
    });
}

// --- UI Updates ---
function showPage(pageId) {
    const previouslyActive = document.querySelector('.page.active-page');
    if (previouslyActive) {
         // Start fade out immediately
        previouslyActive.style.opacity = 0;
        previouslyActive.style.visibility = 'hidden';
    }

    pages.forEach(page => {
        page.classList.remove('active-page');
         // Reset scroll position when page becomes inactive
         if(page.id !== pageId) page.scrollTop = 0;
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active-page');
         // Start fade in after a tiny delay to allow old page removal
        setTimeout(() => {
            targetPage.style.opacity = 1;
            targetPage.style.visibility = 'visible';
        }, 10); // Small delay

         // Scroll chat to bottom when shown
        if (pageId === 'chat-page') {
            scrollToChatBottom(true); // Force immediate scroll
        }
    }

    // Update active nav button
    navButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.page === pageId);
    });
    addBotNavButton.classList.remove('active');

    // Detach listeners when leaving pages if needed
    if (previouslyActive && previouslyActive.id === 'bot-detail-page') {
        stopListeningForComments();
    }
    if (pageId !== 'chat-page' && chatMessagesListener) {
        // Optionally detach chat listener if not on chat page to save resources
        // db.ref('chatMessages').off('child_added', chatMessagesListener);
        // chatMessagesListener = null; // But usually better to keep it active for notifications
    }

    // Attach listeners when entering pages
    if (pageId === 'bot-detail-page' && currentOpenBotId) {
        listenForComments(currentOpenBotId);
    }
    if (pageId === 'chat-page' && !chatMessagesListener) {
        listenForChatMessages(); // Ensure listener is active
    }

    // Hide detail page if navigating away completely
    if (pageId !== 'bot-detail-page') {
        currentOpenBotId = null;
        // botDetailPage class is handled by the main logic above
    }
    if (pageId !== 'home-page') searchInput.value = '';
    if (pageId !== 'chat-page') hidePointTransferUI(); // Hide transfer UI when leaving chat

    console.log("Showing page:", pageId);
}

function updateProfileUI() {
    if (!currentUser) return;
    profileName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`;
    profileUsername.textContent = userProfile.username ? `@${userProfile.username}` : 'Not set';
    profileChatId.textContent = currentUser.id;
    profilePoints.textContent = formatNumber(userProfile.points || 0);
}

function displayBots() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'all';

    // Filter based on search and active status FOR HOME PAGE ONLY
    let filteredBots = Object.values(allBots).filter(bot => {
         if (!bot.active) return false; // Hide inactive bots on home page
        return (
            (bot.name?.toLowerCase() || '').includes(searchTerm) ||
            (bot.description?.toLowerCase() || '').includes(searchTerm)
        );
    });

    // Sort (same logic as before)
    const now = Date.now();
    currentBotList = filteredBots.sort((a, b) => {
        const aIsBoosted = a.boostEndDate && a.boostEndDate > now;
        const bIsBoosted = b.boostEndDate && b.boostEndDate > now;
        if (aIsBoosted !== bIsBoosted) return aIsBoosted ? -1 : 1; // Boosted first

        if (activeTab === 'trending') {
            if (aIsBoosted && bIsBoosted) { // Sort boosted by likes if trending
                 return (b.likesCount || 0) - (a.likesCount || 0);
            }
             // Non-boosted trending (adjust score as needed)
            const recencyA = Math.max(0, 1 - (now - (a.createdAt || 0)) / (7 * 24 * 60 * 60 * 1000));
            const recencyB = Math.max(0, 1 - (now - (b.createdAt || 0)) / (7 * 24 * 60 * 60 * 1000));
            const scoreA = (a.likesCount || 0) * 2 + 5 * recencyA; // Example score
            const scoreB = (b.likesCount || 0) * 2 + 5 * recencyB;
            return scoreB - scoreA;
        } else if (activeTab === 'top-liked') {
            return (b.likesCount || 0) - (a.likesCount || 0);
        } else { // 'all' or default
            return (b.createdAt || 0) - (a.createdAt || 0); // Newest first
        }
    });

    // Render
    botListContainer.innerHTML = '';
    if (currentBotList.length === 0) {
        botListContainer.innerHTML = `<p class="placeholder">No bots found${searchTerm ? ' matching "' + searchTerm + '"' : ''}.</p>`;
        return;
    }
    currentBotList.forEach(bot => {
        const card = createBotCard(bot, 'home');
        botListContainer.appendChild(card);
    });
}

function updateMyBotsList() {
     if (!currentUser) return;
    myBotsList.innerHTML = '';
    const userBots = Object.values(allBots)
        .filter(bot => bot.submitterId === currentUser.id)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (userBots.length === 0) {
        myBotsList.innerHTML = '<p class="placeholder">You haven\'t added any bots yet.</p>';
        return;
    }
    userBots.forEach(bot => {
        // Here we *do* show inactive bots owned by the user
        const card = createBotCard(bot, 'profile');
        myBotsList.appendChild(card);
    });
}

function createBotCard(bot, context = 'home') {
    const card = document.createElement('div');
    // Use card class for styling from CSS
    card.className = `bot-card card ${context === 'profile' && !bot.active ? 'inactive-bot' : ''}`;
    card.dataset.botId = bot.id;

    const isLiked = userProfile.likedBots && userProfile.likedBots[bot.id];
    const likeIcon = isLiked ? 'favorite' : 'favorite_border';
    const likeButtonClass = isLiked ? 'like-button liked' : 'like-button';
    const now = Date.now();
    const isBoosted = bot.boostEndDate && bot.boostEndDate > now;

    card.innerHTML = `
        <div style="display: flex; gap: 15px; align-items: flex-start;">
            <img src="${bot.imageLink || 'https://via.placeholder.com/50/333/888?text=Bot'}" alt="${bot.name}" class="bot-image" onerror="this.src='https://via.placeholder.com/50/333/888?text=Bot';">
            <div class="bot-info">
                <h3>
                    ${bot.name || 'Unnamed Bot'}
                    ${isBoosted ? '<span class="material-symbols-outlined" title="Boosted">rocket_launch</span>' : ''}
                    ${context === 'profile' && bot.active === false ? '<span style="color: #ff9800; font-size: 0.8em; font-weight: normal;"> (Inactive)</span>': ''}
                </h3>
                <p>${bot.description || 'No description.'}</p>
                <div class="bot-meta">
                    <span class="likes">
                        <button class="${likeButtonClass}" data-bot-id="${bot.id}" title="Like Bot">
                            <span class="material-symbols-outlined">${likeIcon}</span>
                        </button>
                        <span class="like-count">${formatNumber(bot.likesCount || 0)}</span>
                    </span>
                    <span class="submitter" title="Submitted by">
                        <span class="material-symbols-outlined" style="font-size: 1em;">person</span>
                        <span>${bot.submitterUsername || 'Unknown'}</span>
                    </span>
                </div>
            </div>
        </div>
         ${context === 'profile' ? `
            <div class="bot-actions">
                <button class="edit-bot-button" data-bot-id="${bot.id}" title="Edit Bot"><span class="material-symbols-outlined">edit</span></button>
                <button class="boost-bot-button" data-bot-id="${bot.id}" title="Boost Bot"><span class="material-symbols-outlined">rocket_launch</span></button>
            </div>
        ` : ''}
    `;

    // Event listeners (like, card click, edit, boost) - logic remains similar
     const likeButton = card.querySelector('.like-button');
    if (likeButton) {
        likeButton.addEventListener('click', (e) => {
            e.stopPropagation(); handleLikeBot(bot.id);
        });
    }
     if (context === 'home') { // Only home cards navigate to detail view on click
         card.addEventListener('click', () => {
             showBotDetails(bot.id, true); // Navigate flag
         });
     }
      if (context === 'profile') {
         const editButton = card.querySelector('.edit-bot-button');
         const boostButton = card.querySelector('.boost-bot-button');
         if (editButton) editButton.addEventListener('click', (e) => { e.stopPropagation(); handleEditBot(bot.id); });
         if (boostButton) boostButton.addEventListener('click', (e) => { e.stopPropagation(); handleBoostBot(bot.id); });
     }

    return card;
}

// --- Event Listener Setup ---
function setupEventListeners() {
    // Navigation
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const pageId = button.dataset.page;
            if (pageId && !button.classList.contains('active')) {
                showPage(pageId);
                tg.HapticFeedback.impactOccurred('light');
            }
        });
    });
    addBotNavButton.addEventListener('click', () => {
        openAddBotPopup(); tg.HapticFeedback.impactOccurred('medium');
    });
    backToHomeButton.addEventListener('click', () => showPage('home-page'));

    // Search & Tabs
    searchInput.addEventListener('input', debounce(displayBots, 300)); // Add debounce
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (!button.classList.contains('active')) {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                displayBots();
            }
        });
    });

    // Popups
    closePopupButtons.forEach(button => {
        button.addEventListener('click', () => {
            const popupId = button.dataset.popup || button.closest('.popup')?.id;
            if (popupId) closePopup(popupId);
        });
    });

    // Add Bot Form
    addBotForm.addEventListener('submit', handleAddBotSubmit);

    // Profile Actions
    earnAdsFab.addEventListener('click', handleEarnAdsClick); // FAB ads
    earnPointsProfileButton.addEventListener('click', handleEarnAdsClick); // Profile ads

    // Boost Actions
    boostOptions.forEach(button => {
        button.addEventListener('click', handleBoostSelection);
    });

    // Comment Actions
    addCommentForm.addEventListener('submit', handleAddCommentSubmit);
    cancelReplyButton.addEventListener('click', cancelReply);

     // Chat Actions
    sendChatMessageButton.addEventListener('click', handleSendChatMessage);
    chatMessageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent newline
            handleSendChatMessage();
        }
    });
    togglePointTransferButton.addEventListener('click', togglePointTransferUI);
    cancelTransferButton.addEventListener('click', hidePointTransferUI);
    sendPointsButton.addEventListener('click', handleSendPoints);
}

// Simple debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};


// --- Popups (Open/Close/Info) ---
function openPopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) popup.classList.add('active-popup');
}
function closePopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) popup.classList.remove('active-popup');
    // Reset forms inside popups when closed
     if (popupId === 'add-bot-popup') {
         addBotForm.reset();
         document.getElementById('edit-bot-id').value = '';
         document.getElementById('submit-bot-button').textContent = 'Add Bot';
         addBotPopup.querySelector('h2').textContent = 'Add New Bot';
     }
     if (popupId === 'boost-popup') {
         boostStatus.textContent = ''; boostBotIdInput.value = '';
         boostOptions.forEach(btn => btn.disabled = false);
     }
}
function showInfoPopup(title, message) {
    infoPopupTitle.textContent = title;
    infoPopupMessage.textContent = message;
    openPopup('info-popup');
}

// --- Add/Edit/Boost Bot (Largely Unchanged, ensure points use formatNumber) ---
// Add Bot/Edit Bot (handleAddBotSubmit, openAddBotPopup, handleEditBot - keep existing logic)
async function handleAddBotSubmit(event) {
    event.preventDefault();
    if (!currentUser || !db) return;

    const submitButton = document.getElementById('submit-bot-button');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';
    const botIdToEdit = document.getElementById('edit-bot-id').value;

    const botData = {
        name: document.getElementById('bot-name').value.trim(),
        description: document.getElementById('bot-description').value.trim(),
        link: document.getElementById('bot-link').value.trim(),
        imageLink: document.getElementById('bot-image').value.trim() || null,
        telegramCommunity: document.getElementById('bot-community').value.trim() || null,
        airdropName: document.getElementById('bot-airdrop-name').value.trim() || null,
        airdropPoints: parseInt(document.getElementById('bot-airdrop-points').value) || null,
        active: document.getElementById('bot-active').checked,
        submitterId: botIdToEdit ? allBots[botIdToEdit]?.submitterId : currentUser.id,
        submitterUsername: botIdToEdit ? allBots[botIdToEdit]?.submitterUsername : (userProfile.username || `user${currentUser.id}`), // Use profile username
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (!botData.name || !botData.description || !botData.link || !botData.link.startsWith('https://t.me/')) {
        showInfoPopup("Validation Error", "Please fill required fields (*). Bot Link must start with https://t.me/");
        submitButton.disabled = false;
        submitButton.textContent = botIdToEdit ? 'Update Bot' : 'Add Bot';
        return;
    }

    try {
        let action = 'added';
        if (botIdToEdit) {
            action = 'updated';
            if (allBots[botIdToEdit]?.submitterId !== currentUser.id) throw new Error("Permission denied.");
            await db.ref(`bots/${botIdToEdit}`).update(botData);
        } else {
            botData.createdAt = firebase.database.ServerValue.TIMESTAMP;
            botData.likesCount = 0;
            botData.boostEndDate = 0;
            const newBotRef = db.ref('bots').push();
            await newBotRef.set(botData);
        }
        showInfoPopup("Success", `Bot ${action} successfully!`);
        closePopup('add-bot-popup');
        tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
        console.error("Error saving bot:", error);
        showInfoPopup("Error", `Failed to save bot: ${error.message}`);
        tg.HapticFeedback.notificationOccurred('error');
        submitButton.disabled = false;
        submitButton.textContent = botIdToEdit ? 'Update Bot' : 'Add Bot';
    }
}
function openAddBotPopup(editBotData = null) {
     addBotForm.reset();
    const submitButton = document.getElementById('submit-bot-button');
    const editBotIdInput = document.getElementById('edit-bot-id');
    if (editBotData) { // Populate for editing
        document.getElementById('bot-name').value = editBotData.name || '';
        document.getElementById('bot-description').value = editBotData.description || '';
        document.getElementById('bot-link').value = editBotData.link || '';
        document.getElementById('bot-image').value = editBotData.imageLink || '';
        document.getElementById('bot-community').value = editBotData.telegramCommunity || '';
        document.getElementById('bot-airdrop-name').value = editBotData.airdropName || '';
        document.getElementById('bot-airdrop-points').value = editBotData.airdropPoints || '';
        document.getElementById('bot-active').checked = editBotData.active !== undefined ? editBotData.active : true;
        editBotIdInput.value = editBotData.id;
        submitButton.textContent = 'Update Bot';
        addBotPopup.querySelector('h2').textContent = 'Edit Bot';
    } else { // Setup for adding new
        editBotIdInput.value = '';
        submitButton.textContent = 'Add Bot';
        addBotPopup.querySelector('h2').textContent = 'Add New Bot';
        document.getElementById('bot-active').checked = true;
    }
    openPopup('add-bot-popup');
}
function handleEditBot(botId) {
     const botToEdit = allBots[botId];
     if (botToEdit && botToEdit.submitterId === currentUser.id) {
         openAddBotPopup(botToEdit);
     } else {
         showInfoPopup("Permission Denied", "You can only edit your own bots.");
     }
 }

// Boost Bot (handleBoostBot, handleBoostSelection - update costs display)
function handleBoostBot(botId) {
     const bot = allBots[botId];
     if (!bot || bot.submitterId !== currentUser.id) return;
     boostBotIdInput.value = botId;
     boostStatus.textContent = '';
     // Update cost display and disable unaffordable options
     boostOptions.forEach(button => {
         const cost = parseInt(button.dataset.cost);
         button.querySelector('.point-cost').textContent = formatNumber(cost); // Format cost display
         button.disabled = userProfile.points < cost;
         button.title = button.disabled ? "Not enough points" : "";
     });
     openPopup('boost-popup');
 }
async function handleBoostSelection(event) {
     const button = event.target.closest('.boost-option'); // Ensure clicking inside works
     if (!button) return;
     const botId = boostBotIdInput.value;
     const durationDays = parseInt(button.dataset.duration);
     const cost = parseInt(button.dataset.cost);
     if (!botId || !durationDays || !cost || !allBots[botId] || userProfile.points < cost) {
         boostStatus.textContent = 'Error: Cannot boost.';
         return;
     }
     boostOptions.forEach(btn => btn.disabled = true);
     boostStatus.textContent = 'Processing boost...';

     const pointsDeducted = await updateUserPoints(-cost); // Deduct points
     if (!pointsDeducted) {
         boostStatus.textContent = 'Error: Failed to deduct points.';
         boostOptions.forEach(btn => btn.disabled = userProfile.points < parseInt(btn.dataset.cost));
         return;
     }

     const now = Date.now();
     const currentBoostEnd = allBots[botId].boostEndDate || 0;
     const boostStartDate = Math.max(now, currentBoostEnd);
     const newBoostEndDate = boostStartDate + (durationDays * 24 * 60 * 60 * 1000);
     try {
         await db.ref(`bots/${botId}/boostEndDate`).set(newBoostEndDate);
         allBots[botId].boostEndDate = newBoostEndDate; // Update local cache
         boostStatus.textContent = `Success! Bot boosted for ${durationDays} day(s).`;
         tg.HapticFeedback.notificationOccurred('success');
         displayBots(); updateMyBotsList(); // Refresh lists
         setTimeout(() => closePopup('boost-popup'), 2500);
     } catch (error) {
         console.error("Error setting boost end date:", error);
         boostStatus.textContent = 'Points deducted, but failed to set boost. Contact support.';
         tg.HapticFeedback.notificationOccurred('error');
         // !!! Add refund logic here via Cloud Function ideally !!!
     }
 }

// --- Like Logic (Ensure formatNumber is used) ---
async function handleLikeBot(botId, isFromDetailPage = false) {
    if (!currentUser || !db || !botId || !allBots[botId]) return;
    const botRef = db.ref(`bots/${botId}`);
    const userLikesRef = db.ref(`users/${currentUser.id}/likedBots/${botId}`);
    const botData = allBots[botId];
    // Prevent liking own bot (optional)
    // if (botData.submitterId === currentUser.id) { showInfoPopup("Info", "Cannot like own bot."); return; }

    tg.HapticFeedback.impactOccurred('light');
    const alreadyLiked = userProfile.likedBots && userProfile.likedBots[botId];
    const change = alreadyLiked ? -1 : 1;
    const currentlyLiked = !alreadyLiked; // The state *after* the action

    try {
        // Update bot's like count
        const result = await botRef.child('likesCount').transaction(currentCount => {
            return (currentCount || 0) + change;
        });

        if (result.committed) {
            const newLikesCount = result.snapshot.val();
            // Update user's like list
            await userLikesRef.set(currentlyLiked ? true : null);

            // Update local state
            if (!userProfile.likedBots) userProfile.likedBots = {};
            if (currentlyLiked) userProfile.likedBots[botId] = true;
            else delete userProfile.likedBots[botId];

            // Award points to submitter (if not self-like and is a like action)
            if (currentlyLiked && botData.submitterId && botData.submitterId !== currentUser.id) {
                 await db.ref(`users/${botData.submitterId}/points`).transaction(currentPoints => (currentPoints || 0) + LIKE_REWARD_POINTS);
            }

            // Update UI
            updateLikeButtonUI(botId, currentlyLiked, newLikesCount);
            // Update local bot cache
            if(allBots[botId]) allBots[botId].likesCount = newLikesCount;

        } else { throw new Error("Like transaction failed."); }
    } catch (error) {
        console.error("Error liking/unliking bot:", error);
        showInfoPopup("Error", "Could not update like status.");
        // Revert UI potentially needed here
    }
}

function updateLikeButtonUI(botId, isLiked, newCount) {
    const formattedCount = formatNumber(newCount);
    const icon = isLiked ? 'favorite' : 'favorite_border';
    // Update card on home/profile page
    const cardLikeButtons = document.querySelectorAll(`.like-button[data-bot-id="${botId}"]`);
    cardLikeButtons.forEach(button => {
        button.classList.toggle('liked', isLiked);
        button.querySelector('.material-symbols-outlined').textContent = icon;
        const countSpan = button.closest('.likes').querySelector('.like-count');
        if (countSpan) countSpan.textContent = formattedCount;
    });
    // Update detail page if open
    if (currentOpenBotId === botId) {
        const detailLikeButton = botDetailContent.querySelector('#detail-like-button');
        const detailLikeCount = botDetailContent.querySelector('#detail-like-count');
        if (detailLikeButton) {
            detailLikeButton.classList.toggle('liked', isLiked);
            detailLikeButton.querySelector('.material-symbols-outlined').textContent = icon;
        }
        if (detailLikeCount) {
            detailLikeCount.textContent = `${formattedCount} Likes`;
        }
    }
}


// --- Points & Ads Logic (Unchanged - handleEarnAdsClick, updateUserPoints) ---
async function updateUserPoints(pointsToAdd) {
    if (!currentUser || !db || pointsToAdd === 0) return false;
    const userPointsRef = db.ref(`users/${currentUser.id}/points`);
    try {
        const result = await userPointsRef.transaction(currentPoints => {
             const basePoints = (typeof currentPoints === 'number') ? currentPoints : 0;
            return basePoints + pointsToAdd;
        });
        if (result.committed) {
            userProfile.points = result.snapshot.val();
            updateProfileUI();
            console.log(`Points updated by ${pointsToAdd}. New total: ${userProfile.points}`);
            return true;
        } else { console.warn("Points transaction aborted."); return false; }
    } catch (error) {
        console.error("Error updating points:", error);
        showInfoPopup("Error", "Failed to update points.");
        return false;
    }
}

function handleEarnAdsClick() {
    if (adCooldown) {
        showInfoPopup("Cooldown", `Please wait before watching another ad.`);
        return;
    }
     if (typeof show_9263144 !== 'function') {
         showInfoPopup("Error", "Ad service unavailable. Try again later.");
         return;
    }
    // Disable both buttons
    earnAdsFab.disabled = true; earnPointsProfileButton.disabled = true;
    earnAdsFab.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;
    showInfoPopup("Loading Ad", "Please wait...");

    show_9263144().then(async () => {
        console.log("Ad watched.");
        closePopup('info-popup');
        showInfoPopup("Success!", `Ad watched! You earned ${formatNumber(AD_REWARD_POINTS)} points.`);
        tg.HapticFeedback.notificationOccurred('success');
        await updateUserPoints(AD_REWARD_POINTS);
        adCooldown = true;
        setTimeout(() => { adCooldown = false; console.log("Ad cooldown finished."); }, AD_COOLDOWN_MS);
    }).catch((error) => {
        console.error("Ad SDK error:", error);
        closePopup('info-popup');
        showInfoPopup("Ad Not Completed", "No points awarded.");
        tg.HapticFeedback.notificationOccurred('warning');
    }).finally(() => {
        earnAdsFab.disabled = false; earnPointsProfileButton.disabled = false;
        earnAdsFab.innerHTML = `<span class="material-symbols-outlined">paid</span> <span class="fab-text">Earn</span>`;
    });
}

// --- Bot Detail & Comments ---
function showBotDetails(botId, navigate = true) { // Added navigate flag
    const bot = allBots[botId];
    if (!bot) {
        showInfoPopup("Error", "Bot details not found.");
        if (navigate) showPage('home-page'); // Go back if bot doesn't exist
        return;
    }
    currentOpenBotId = botId; // Set current bot *before* showing page

    // --- Populate Bot Info ---
    detailBotName.textContent = bot.name || 'Bot Details';
    const isLiked = userProfile.likedBots && userProfile.likedBots[bot.id];
    const likeIcon = isLiked ? 'favorite' : 'favorite_border';
    const likeButtonClass = isLiked ? 'detail-like-button liked' : 'detail-like-button';

    botDetailContent.innerHTML = `
        ${bot.imageLink ? `<img src="${bot.imageLink}" alt="${bot.name}" onerror="this.style.display='none';">` : ''}
        <p id="detail-description">${bot.description || 'No description.'}</p>
        <div id="detail-meta">
            <p><strong>Link:</strong> <a href="${bot.link}" target="_blank" rel="noopener noreferrer">${bot.link}</a></p>
            ${bot.telegramCommunity ? `<p><strong>Community:</strong> <a href="${bot.telegramCommunity}" target="_blank" rel="noopener noreferrer">${bot.telegramCommunity}</a></p>` : ''}
            ${bot.airdropName ? `<p><strong>Airdrop:</strong> ${bot.airdropName} ${bot.airdropPoints ? `(${formatNumber(bot.airdropPoints)} pts)` : ''}</p>` : ''}
            <p><strong>Submitted by:</strong> @${bot.submitterUsername || 'Unknown'}</p>
            <p><strong>Added:</strong> ${formatTimestamp(bot.createdAt || 0)}</p>
        </div>
        <div id="detail-like-section">
             <button class="${likeButtonClass}" id="detail-like-button" data-bot-id="${bot.id}">
                <span class="material-symbols-outlined">${likeIcon}</span> Like
            </button>
            <span id="detail-like-count">${formatNumber(bot.likesCount || 0)} Likes</span>
        </div>
    `;
    // Add listener for detail page like button
    const detailLikeButton = botDetailContent.querySelector('#detail-like-button');
    if (detailLikeButton) {
        detailLikeButton.addEventListener('click', (e) => {
            e.stopPropagation(); handleLikeBot(bot.id, true);
        });
    }

    // --- Comments Setup ---
    commentInput.value = ''; // Clear input
    cancelReply(); // Ensure reply mode is off
    commentList.innerHTML = '<p class="placeholder">Loading comments...</p>'; // Reset comments view
    commentCountSpan.textContent = '...'; // Placeholder count

    if (navigate) {
        showPage('bot-detail-page');
        // Listener attached by showPage function
    } else {
         // If just refreshing data, ensure listener is still active
        stopListeningForComments(); // Stop previous if any
        listenForComments(botId);
    }
     // Ensure detail page scrolls to top if navigating
    if(navigate) botDetailPage.scrollTop = 0;
}

function listenForComments(botId) {
    if (!botId) return;
    stopListeningForComments(); // Ensure no duplicate listeners

    const commentsRef = db.ref(`comments/${botId}`).orderByChild('timestamp');
    commentListener = commentsRef.on('value', (snapshot) => {
        currentComments = {};
        let count = 0;
        if (snapshot.exists()) {
            snapshot.forEach(childSnapshot => {
                currentComments[childSnapshot.key] = { id: childSnapshot.key, ...childSnapshot.val() };
                count++;
            });
        }
        commentCountSpan.textContent = formatNumber(count);
        displayComments(currentComments);
    }, (error) => {
        console.error("Error listening for comments:", error);
        commentList.innerHTML = '<p class="placeholder">Error loading comments.</p>';
    });
    console.log("Listening for comments on bot:", botId);
}

function stopListeningForComments() {
    if (commentListener && currentOpenBotId) {
        db.ref(`comments/${currentOpenBotId}`).off('value', commentListener);
        commentListener = null;
        console.log("Stopped listening for comments on bot:", currentOpenBotId);
    }
    currentComments = {}; // Clear local cache
}

function displayComments(commentsData) {
    commentList.innerHTML = ''; // Clear list
    const commentsArray = Object.values(commentsData).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); // Sort by time ASC

    if (commentsArray.length === 0) {
        commentList.innerHTML = '<p class="placeholder">Be the first to comment!</p>';
        return;
    }

    // Create a map for easy lookup and structure for threading
    const commentsMap = {};
    commentsArray.forEach(comment => {
        commentsMap[comment.id] = { ...comment, children: [] };
    });

    // Build the tree structure
    const rootComments = [];
    commentsArray.forEach(comment => {
        if (comment.parentId && commentsMap[comment.parentId]) {
            commentsMap[comment.parentId].children.push(commentsMap[comment.id]);
        } else {
            rootComments.push(commentsMap[comment.id]);
        }
    });

    // Render comments recursively
    rootComments.forEach(comment => renderComment(comment, commentList, 0));
}

function renderComment(comment, container, level) {
    const commentElement = document.createElement('div');
    commentElement.className = `comment-item ${level > 0 ? 'reply' : ''}`;
    commentElement.dataset.commentId = comment.id;

    // Basic XSS prevention (replace < and >) - needs more robust solution for production
    const safeText = (comment.text || '').replace(/</g, "<").replace(/>/g, ">");
    const safeUsername = (comment.username || 'Anonymous').replace(/</g, "<").replace(/>/g, ">");

    commentElement.innerHTML = `
        <div class="comment-header">
            <span class="comment-author">${safeUsername}</span>
            <span class="comment-timestamp">${formatTimestamp(comment.timestamp)}</span>
        </div>
        <div class="comment-text">${safeText.replace(/\n/g, '<br>')}</div>
        <div class="comment-actions">
            ${level < 3 ? // Limit reply depth for simplicity
                `<button class="reply-button" data-comment-id="${comment.id}" data-username="${safeUsername}">
                    <span class="material-symbols-outlined">reply</span> Reply
                 </button>`
                 : ''}
            <!-- Add delete button if comment.userId === currentUser.id -->
        </div>
    `;

    // Add event listener for the reply button
    const replyButton = commentElement.querySelector('.reply-button');
    if (replyButton) {
        replyButton.addEventListener('click', () => {
            startReply(comment.id, safeUsername);
        });
    }

    container.appendChild(commentElement);

    // Render children replies recursively
    if (comment.children && comment.children.length > 0) {
        comment.children.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).forEach(reply => {
            renderComment(reply, container, level + 1); // Append replies to the same container
        });
    }
}


async function handleAddCommentSubmit(event) {
    event.preventDefault();
    if (!currentUser || !db || !currentOpenBotId) return;

    const text = commentInput.value.trim();
    const parentId = replyToCommentIdInput.value || null; // Get parent ID if replying

    if (!text) {
        showInfoPopup("Input Error", "Comment cannot be empty.");
        return;
    }

    const commentData = {
        botId: currentOpenBotId,
        userId: currentUser.id,
        username: userProfile.username || `User ${currentUser.id}`, // Use stored username
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        parentId: parentId
    };

    const commentButton = addCommentForm.querySelector('button[type="submit"]');
    commentButton.disabled = true;
    commentButton.textContent = 'Posting...';

    try {
        await db.ref(`comments/${currentOpenBotId}`).push(commentData);
        commentInput.value = ''; // Clear input
        cancelReply(); // Exit reply mode
        tg.HapticFeedback.notificationOccurred('success');
        // Let the listener update the UI
    } catch (error) {
        console.error("Error adding comment:", error);
        showInfoPopup("Error", "Failed to post comment.");
        tg.HapticFeedback.notificationOccurred('error');
    } finally {
        commentButton.disabled = false;
        commentButton.textContent = 'Comment';
    }
}

function startReply(commentId, username) {
    replyToCommentIdInput.value = commentId;
    replyingToIndicator.textContent = `Replying to @${username} `;
    replyingToIndicator.appendChild(cancelReplyButton); // Move button inside
    replyingToIndicator.classList.remove('hidden');
    commentInput.focus();
    tg.HapticFeedback.impactOccurred('light');
}

function cancelReply() {
    replyToCommentIdInput.value = '';
    replyingToIndicator.classList.add('hidden');
     // Ensure the cancel button is properly handled if it was moved
     if (!document.getElementById('cancel-reply-button')) {
         // If it got removed somehow, recreate or ensure it exists within the indicator span structure
         replyingToIndicator.innerHTML = `Replying to ... <button type="button" id="cancel-reply-button">×</button>`;
         // Re-attach listener if needed, though original reference should persist if element wasn't fully destroyed
     }
    console.log("Cancelled reply");
}


// --- Chat Logic ---
function listenForChatMessages() {
    if (chatMessagesListener) return; // Already listening

    const messagesRef = db.ref('chatMessages').limitToLast(CHAT_MESSAGES_LIMIT);

    // Listen for new messages added
    chatMessagesListener = messagesRef.on('child_added', (snapshot) => {
        if (document.getElementById('chat-page').classList.contains('active-page')) {
            const messageData = { id: snapshot.key, ...snapshot.val() };
            displayChatMessage(messageData);
        }
    }, (error) => {
        console.error("Error listening for chat messages:", error);
         chatMessagesContainer.innerHTML = '<p class="placeholder">Error loading chat.</p>';
    });

     // Initial load (or fetch when page becomes active)
     messagesRef.once('value', (snapshot) => {
         chatMessagesContainer.innerHTML = ''; // Clear placeholders
         if (snapshot.exists()) {
             snapshot.forEach(childSnapshot => {
                 const messageData = { id: childSnapshot.key, ...childSnapshot.val() };
                 displayChatMessage(messageData, true); // true = initial load, don't animate scroll yet
             });
             if (document.getElementById('chat-page').classList.contains('active-page')) {
                scrollToChatBottom(true); // Scroll after initial load if page is active
             }
         } else {
              chatMessagesContainer.innerHTML = '<p class="placeholder">No messages yet. Start chatting!</p>';
         }
     });

    console.log("Listening for chat messages.");
}

function displayChatMessage(msg, isInitialLoad = false) {
     if (!currentUser) return; // Should not happen if initialized correctly

    const msgElement = document.createElement('div');
    msgElement.dataset.messageId = msg.id;
    const isSent = msg.senderId === currentUser.id;
    const safeText = (msg.text || '').replace(/</g, "<").replace(/>/g, ">");
    const safeSenderName = (msg.senderUsername || 'Unknown').replace(/</g, "<").replace(/>/g, ">");

    if (msg.type === 'point_transfer') {
        // Special display for point transfers
        msgElement.className = 'chat-message event';
        msgElement.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 1em; vertical-align: middle;">currency_bitcoin</span>
            ${safeText}
            <span class="message-timestamp">${formatTimestamp(msg.timestamp)}</span>`;
    } else {
        // Regular chat message
        msgElement.className = `chat-message ${isSent ? 'sent' : 'received'}`;
        msgElement.innerHTML = `
            ${!isSent ? `<span class="message-sender">@${safeSenderName}</span>` : ''}
            <span class="message-text">${safeText.replace(/\n/g, '<br>')}</span>
            <span class="message-timestamp">${formatTimestamp(msg.timestamp)}</span>
        `;
    }

    // Find the correct place to insert based on timestamp (optional, usually append is fine for 'child_added')
    // const existingMessages = chatMessagesContainer.querySelectorAll('.chat-message');
    // let inserted = false;
    // for (let i = existingMessages.length - 1; i >= 0; i--) {
    //     const existingTimestamp = parseInt(existingMessages[i].dataset.timestamp || '0');
    //     if (msg.timestamp > existingTimestamp) {
    //         chatMessagesContainer.insertBefore(msgElement, existingMessages[i].nextSibling);
    //         inserted = true;
    //         break;
    //     }
    // }
    // if (!inserted) {
        chatMessagesContainer.appendChild(msgElement); // Append if newest or first
    // }


    // Scroll to bottom only if user is near the bottom or it's their own message
    if (!isInitialLoad) {
        const isScrolledToBottom = chatMessagesContainer.scrollHeight - chatMessagesContainer.clientHeight <= chatMessagesContainer.scrollTop + 50; // 50px tolerance
        if (isSent || isScrolledToBottom) {
            scrollToChatBottom();
        }
    }
}

function scrollToChatBottom(instant = false) {
    chatMessagesContainer.scrollTo({
        top: chatMessagesContainer.scrollHeight,
        behavior: instant ? 'instant' : 'smooth'
    });
}

async function handleSendChatMessage() {
    if (!currentUser || !db) return;
    const text = chatMessageInput.value.trim();
    if (!text) return;

    const messageData = {
        senderId: currentUser.id,
        senderUsername: userProfile.username || `User ${currentUser.id}`,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        type: 'message' // Mark as regular message
    };

    chatMessageInput.value = ''; // Clear input immediately
    sendChatMessageButton.disabled = true; // Prevent double send

    try {
        await db.ref('chatMessages').push(messageData);
        tg.HapticFeedback.impactOccurred('light');
        // Listener will add the message to the UI
    } catch (error) {
        console.error("Error sending chat message:", error);
        showInfoPopup("Error", "Failed to send message.");
        chatMessageInput.value = text; // Restore text on error
        tg.HapticFeedback.notificationOccurred('error');
    } finally {
        sendChatMessageButton.disabled = false;
    }
}

// --- Point Transfer (HIGHLY INSECURE - Requires Cloud Functions) ---
function togglePointTransferUI() {
    pointTransferUI.classList.toggle('hidden');
    if (!pointTransferUI.classList.contains('hidden')) {
        recipientIdInput.focus();
    }
}
function hidePointTransferUI() {
    pointTransferUI.classList.add('hidden');
    recipientIdInput.value = '';
    transferAmountInput.value = '';
}

async function handleSendPoints() {
    if (!currentUser || !db) return;

    const recipientId = parseInt(recipientIdInput.value.trim());
    const amount = parseInt(transferAmountInput.value.trim());

    // --- !! CRITICAL VALIDATION !! ---
    if (!recipientId || isNaN(recipientId) || recipientId === currentUser.id) {
        showInfoPopup("Error", "Invalid recipient Chat ID.");
        return;
    }
    if (!amount || isNaN(amount) || amount <= 0) {
        showInfoPopup("Error", "Invalid point amount (must be positive).");
        return;
    }
    if (userProfile.points < amount) {
        showInfoPopup("Error", `Insufficient points. You have ${formatNumber(userProfile.points)}.`);
        return;
    }

    // --- !! SECURITY WARNING !! ---
    // The following transaction logic is INSECURE on the client-side.
    // It MUST be moved to a Firebase Cloud Function for a real application.
    // A malicious user could bypass the client-side checks.
    //----------------------------------

    showInfoPopup("Security Risk", "Point transfer initiated. NOTE: This client-side transfer is insecure and for demonstration only. Use Cloud Functions in production!");
    console.warn("INSECURE POINT TRANSFER ATTEMPTED FROM CLIENT");


    sendPointsButton.disabled = true;
    sendPointsButton.textContent = 'Sending...';

    const senderRef = db.ref(`users/${currentUser.id}/points`);
    const recipientRef = db.ref(`users/${recipientId}/points`);
    const recipientUserRef = db.ref(`users/${recipientId}`); // To check if recipient exists

    try {
         // 1. Check if recipient exists (basic check)
         const recipientSnapshot = await recipientUserRef.once('value');
         if (!recipientSnapshot.exists()) {
             throw new Error("Recipient user does not exist in the app's database.");
         }
         const recipientUsername = recipientSnapshot.val().username || `User ${recipientId}`;


        // 2. Perform transaction (INSECURE - Needs Cloud Function)
        const senderTx = senderRef.transaction(currentPoints => {
            if (currentPoints === null || currentPoints < amount) {
                return; // Abort transaction (insufficient funds)
            }
            return currentPoints - amount;
        });

        const recipientTx = recipientRef.transaction(currentPoints => {
             // Allow creating points node if it doesn't exist
            return (currentPoints || 0) + amount;
        });


        // Wait for both transactions
        const [senderResult, recipientResult] = await Promise.all([senderTx, recipientTx]);

        if (senderResult.committed && recipientResult.committed) {
            // Success! Update local points
            userProfile.points = senderResult.snapshot.val();
            updateProfileUI();

             // Post a message to chat about the transfer
             const transferMessage = {
                 senderId: currentUser.id,
                 senderUsername: userProfile.username || `User ${currentUser.id}`,
                 recipientId: recipientId,
                 recipientUsername: recipientUsername,
                 amount: amount,
                 text: `@${userProfile.username || currentUser.id} sent ${formatNumber(amount)} points to @${recipientUsername}`,
                 timestamp: firebase.database.ServerValue.TIMESTAMP,
                 type: 'point_transfer'
             };
             await db.ref('chatMessages').push(transferMessage);


            showInfoPopup("Success", `Successfully sent ${formatNumber(amount)} points to @${recipientUsername}.`);
            tg.HapticFeedback.notificationOccurred('success');
            hidePointTransferUI();

        } else {
            // Transaction failed (e.g., insufficient funds detected during transaction, or recipient failed)
             throw new Error("Point transfer failed. Points may not have been deducted or recipient update failed.");
             // !!! Need rollback logic here if one succeeded and the other failed - Cloud Functions handle this better !!!
        }

    } catch (error) {
        console.error("Point Transfer Error:", error);
        showInfoPopup("Transfer Failed", `Error: ${error.message}. Please try again.`);
        tg.HapticFeedback.notificationOccurred('error');
        // Rollback is complex here client-side, hence Cloud Functions are vital.
    } finally {
        sendPointsButton.disabled = false;
        sendPointsButton.textContent = 'Send Pts';
    }
}


// --- Start the App ---
initializeApp();
