// Firebase Config (Keep as is)
const firebaseConfig = {
    apiKey: "AIzaSyBW1WPXUN8DYhT6npZQYoQ3l4J-jFSbzfg", // Use Rules!
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
let userProfile = { points: 0, likedBots: {}, lastAdWatch: 0 }; // Removed lastDailyShare
let allBots = {};
let currentBotList = [];
let currentOpenBotId = null; // For detail view & comments
let currentEditBotId = null;
let adCooldown = false;
const LIKE_REWARD_POINTS = 10;
const AD_REWARD_POINTS = 10;
const AD_COOLDOWN_MS = 30 * 1000; // 30 seconds
const CHAT_MESSAGE_LIMIT = 50; // How many chat messages to load initially

// Firebase Listeners References (to detach later if needed)
let botsListenerRef = null;
let commentsListenerRef = null;
let chatListenerRef = null;

// --- DOM Elements ---
const loadingScreen = document.getElementById('loading-screen');
const errorMessage = document.getElementById('error-message');
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
const homeEarnAdsButton = document.getElementById('home-earn-ads-button'); // FAB ads button
const profileEarnAdsButton = document.getElementById('profile-earn-ads-button'); // Profile ads button

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
const commentsList = document.getElementById('comments-list');
const addCommentForm = document.getElementById('add-comment-form');
const commentInput = document.getElementById('comment-input');

// Chat Page Elements
const chatPage = document.getElementById('chat-page');
const chatMessagesContainer = document.getElementById('chat-messages-container');
const chatMessagesDiv = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// --- Number Formatting Utility ---
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    num = Number(num); // Ensure it's a number
    if (Math.abs(num) < 1000) return num.toString();

    const suffixes = ['', 'K', 'M', 'B', 'T']; // Add more if needed (Trillion, Quadrillion)
    // Determine the correct suffix index
    let i = 0;
    while (Math.abs(num) >= 1000 && i < suffixes.length - 1) {
        num /= 1000;
        i++;
    }
    // Format to 1 decimal place if needed, remove trailing .0
    const formattedNum = num.toFixed(1).replace(/\.0$/, '');
    return formattedNum + suffixes[i];
}

// --- Initialization ---
function initializeApp() {
    tg.ready();
    tg.expand();

    // --- Check if running inside Telegram ---
    if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        showError("This app requires Telegram to function.");
        // Maybe disable functionality instead of closing
        // tg.close();
        return;
    }

    currentUser = tg.initDataUnsafe.user;
    // IMPORTANT: VERIFY tg.initData on backend for production security!

    // --- Initialize Firebase ---
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        console.log("Firebase Initialized");
        fetchInitialData(); // Fetch profile first
    } catch (error) {
        console.error("Firebase Init Error:", error);
        showError("Failed to connect to the database.");
    }

    setupEventListeners();
    // Don't show home page until profile is loaded
}

function showError(message) {
    loadingScreen.classList.add('active-page');
    loadingScreen.querySelector('p').textContent = "Error";
    loadingScreen.querySelector('.spinner').style.display = 'none';
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    console.error(message);
    pages.forEach(p => { if (p.id !== 'loading-screen') p.classList.remove('active-page') });
}

// --- Data Fetching & Realtime Listeners ---
async function fetchInitialData() {
    if (!currentUser || !db) return;
    await fetchUserProfile(); // Wait for profile
    // Now safe to proceed
    listenForBots();
    listenForChatMessages(); // Start listening for chat messages
    showPage('home-page'); // Show home after profile is ready
    loadingScreen.classList.remove('active-page');
}

async function fetchUserProfile() {
    const userRef = db.ref(`users/${currentUser.id}`);
    try {
        const snapshot = await userRef.once('value');
        if (snapshot.exists()) {
            userProfile = { points: 0, likedBots: {}, ...snapshot.val() }; // Default values + DB values
            if (!userProfile.likedBots || typeof userProfile.likedBots !== 'object') {
                userProfile.likedBots = {};
            }
            console.log("User profile loaded:", userProfile);
        } else {
            console.log("Creating new user profile");
            await userRef.set({
                id: currentUser.id,
                firstName: currentUser.first_name || '',
                lastName: currentUser.last_name || '',
                username: currentUser.username || `user${currentUser.id}`, // Use ID if no username
                points: 0,
                likedBots: {},
                lastAdWatch: 0, // Add this field
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            userProfile = { points: 0, likedBots: {}, lastAdWatch: 0 }; // Set local state
        }
        updateProfileUI();
    } catch (error) {
        console.error("Error fetching user profile:", error);
        showInfoPopup("Profile Error", "Could not load your profile data.");
        // Allow app to continue but profile might be wrong
    }
}

function listenForBots() {
    // Detach previous listener if exists
    if (botsListenerRef) botsListenerRef.off();

    botsListenerRef = db.ref('bots');
    botsListenerRef.orderByChild('createdAt').on('value', (snapshot) => {
        allBots = {};
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const botData = childSnapshot.val();
                // Basic validation and default values
                if (botData && typeof botData === 'object') {
                     const isActive = botData.active !== undefined ? botData.active : true;
                      // Only show active bots OR user's own bots on home/profile
                     if (isActive || botData.submitterId === currentUser.id) {
                         allBots[childSnapshot.key] = {
                            id: childSnapshot.key,
                            name: botData.name || 'Unnamed Bot',
                            description: botData.description || '',
                            link: botData.link || '',
                            imageLink: botData.imageLink || null,
                            telegramCommunity: botData.telegramCommunity || null,
                            airdropName: botData.airdropName || null,
                            airdropPoints: botData.airdropPoints || null,
                            active: isActive,
                            submitterId: botData.submitterId || null,
                            submitterUsername: botData.submitterUsername || 'Unknown',
                            createdAt: botData.createdAt || 0,
                            likesCount: botData.likesCount || 0,
                            boostEndDate: botData.boostEndDate || 0,
                            // DO NOT store comments directly in bot object - fetch separately
                        };
                     }
                }
            });
        }
        console.log("Bots updated:", Object.keys(allBots).length);
        displayBots(); // Update home page list
        updateMyBotsList(); // Update profile page list
        // If detail page is open, refresh its like count etc. (but not comments here)
        if(currentOpenBotId && allBots[currentOpenBotId]) {
             updateBotDetailLikeSection(allBots[currentOpenBotId]);
        }
    }, (error) => {
        console.error("Error listening for bots:", error);
        botListContainer.innerHTML = '<p class="placeholder">Error loading bots.</p>';
    });
}

function listenForComments(botId) {
     // Detach previous listener
    if (commentsListenerRef) commentsListenerRef.off();

    commentsList.innerHTML = '<p class="placeholder">Loading comments...</p>'; // Show loading state
    commentsListenerRef = db.ref(`bots/${botId}/comments`).orderByChild('timestamp');

    commentsListenerRef.on('value', (snapshot) => {
        commentsList.innerHTML = ''; // Clear previous comments
        if (!snapshot.exists()) {
            commentsList.innerHTML = '<p class="placeholder">Be the first to comment!</p>';
            return;
        }

        const botOwnerId = allBots[botId]?.submitterId; // Get owner ID

        snapshot.forEach((commentSnapshot) => {
            const commentData = commentSnapshot.val();
            const commentId = commentSnapshot.key;
            if (commentData && commentData.userId && commentData.text) {
                const isOwner = botOwnerId && commentData.userId === botOwnerId;
                const commentCard = createCommentCard(commentData, commentId, isOwner);
                commentsList.appendChild(commentCard);
            }
        });
         // Scroll comments? Maybe not necessary unless very long list.
    }, (error) => {
        console.error(`Error listening for comments on bot ${botId}:`, error);
        commentsList.innerHTML = '<p class="placeholder" style="color: var(--error-color);">Error loading comments.</p>';
    });
}

function listenForChatMessages() {
    // Detach previous listener if exists
    if (chatListenerRef) chatListenerRef.off();

    chatMessagesDiv.innerHTML = '<p class="placeholder">Loading messages...</p>';
    chatListenerRef = db.ref('chatMessages').orderByChild('timestamp').limitToLast(CHAT_MESSAGE_LIMIT);

    chatListenerRef.on('value', (snapshot) => {
        chatMessagesDiv.innerHTML = ''; // Clear existing messages
        if (!snapshot.exists()) {
            chatMessagesDiv.innerHTML = '<p class="placeholder">No messages yet. Start the conversation!</p>';
            return;
        }
        snapshot.forEach((msgSnapshot) => {
            const msgData = msgSnapshot.val();
            if (msgData && msgData.userId && msgData.text && msgData.timestamp) {
                const messageElement = createChatMessageElement(msgData);
                 // Prepend because container is reversed
                chatMessagesDiv.prepend(messageElement);
            }
        });
        // Scroll to bottom (or top, since it's reversed) after rendering
        // scrollToChatBottom(); // Might not be needed with flex-direction: column-reverse
    }, (error) => {
        console.error("Error listening for chat messages:", error);
        chatMessagesDiv.innerHTML = '<p class="placeholder" style="color: var(--error-color);">Error loading chat.</p>';
    });
}

// --- UI Updates ---
function showPage(pageId) {
     // Detach listeners for pages we are leaving
     if (!pageId.startsWith('bot-detail') && commentsListenerRef) {
         commentsListenerRef.off();
         commentsListenerRef = null;
         currentOpenBotId = null; // Clear open bot ID when leaving detail page
     }
     // Add similar logic for chat listener if needed (but chat is usually always on)

    pages.forEach(page => {
        const isActive = page.id === pageId;
        page.classList.toggle('active-page', isActive);
        // Reset scroll for pages when they become active (except chat maybe)
        if (isActive && page.id !== 'chat-page') {
             page.scrollTop = 0;
        }
    });

    navButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.page === pageId);
    });
    addBotNavButton.classList.remove('active');

    // Refresh data or attach listeners for the new page
    if (pageId === 'profile-page') {
        updateProfileUI();
        updateMyBotsList();
    } else if (pageId === 'home-page') {
        displayBots(); // Ensure list is current
    } else if (pageId === 'chat-page') {
        scrollToChatBottom(); // Scroll down when entering chat
         // Listener is already active
    } else if (pageId === 'bot-detail-page') {
         // Listener attached in showBotDetails
    }

    if (pageId !== 'home-page') { searchInput.value = ''; }
}

function updateProfileUI() {
    if (!currentUser) return;
    profileName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`;
    profileUsername.textContent = currentUser.username ? `@${currentUser.username}` : 'Not set';
    profileChatId.textContent = currentUser.id;
    profilePoints.textContent = formatNumber(userProfile.points); // Use formatter
    profilePoints.classList.add('points-display'); // Add class for potential styling/suffix
}

function displayBots() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'all';

    // Filter active bots for home page display
    let filteredBots = Object.values(allBots).filter(bot => bot.active === true && (
        (bot.name?.toLowerCase() || '').includes(searchTerm) ||
        (bot.description?.toLowerCase() || '').includes(searchTerm)
    ));

    // Sort (Boosted first, then by tab criteria)
    const now = Date.now();
    currentBotList = filteredBots.sort((a, b) => {
        const aIsBoosted = a.boostEndDate && a.boostEndDate > now;
        const bIsBoosted = b.boostEndDate && b.boostEndDate > now;

        if (aIsBoosted !== bIsBoosted) return aIsBoosted ? -1 : 1; // Boosted always first

        // Sort by criteria if boost status is the same
        if (activeTab === 'trending') {
            const scoreA = (a.likesCount || 0) + ((a.boostEndDate || 0) > now ? 1000000 : 0); // Simple boost priority within trending
            const scoreB = (b.likesCount || 0) + ((b.boostEndDate || 0) > now ? 1000000 : 0);
            if(scoreA !== scoreB) return scoreB - scoreA; // Prioritize likes among boosted/non-boosted
             return (b.createdAt || 0) - (a.createdAt || 0); // Fallback to newest if likes are same
        } else if (activeTab === 'top-liked') {
            return (b.likesCount || 0) - (a.likesCount || 0);
        } else { // 'all'
            return (b.createdAt || 0) - (a.createdAt || 0);
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
        const card = createBotCard(bot, 'profile');
        myBotsList.appendChild(card);
    });
}

function createBotCard(bot, context = 'home') {
    const card = document.createElement('div');
    // Use card-style class for consistent appearance
    card.className = 'bot-card card-style';
    card.dataset.botId = bot.id;

    const isLiked = userProfile.likedBots && userProfile.likedBots[bot.id];
    const likeIcon = isLiked ? 'favorite' : 'favorite_border';
    const likeButtonClass = isLiked ? 'like-button liked' : 'like-button';
    const now = Date.now();
    const isBoosted = bot.boostEndDate && bot.boostEndDate > now;

    card.innerHTML = `
        <img src="${bot.imageLink || 'https://via.placeholder.com/55/444/888?text=?'}" alt="${bot.name}" class="bot-image" onerror="this.src='https://via.placeholder.com/55/444/888?text=?'; this.onerror=null;">
        <div class="bot-info">
            <h3>
                ${bot.name}
                ${isBoosted ? '<span class="material-symbols-outlined" title="Boosted">rocket_launch</span>' : ''}
                ${bot.active === false ? '<span class="inactive-tag">Inactive</span>': ''}
            </h3>
            <p class="description">${bot.description || 'No description.'}</p>
            <div class="bot-meta">
                <span class="likes">
                    <button class="${likeButtonClass}" data-bot-id="${bot.id}" title="Like Bot">
                        <span class="material-symbols-outlined">${likeIcon}</span>
                    </button>
                    <span class="like-count">${formatNumber(bot.likesCount)}</span>
                </span>
                <span class="submitter" title="Submitted by ${bot.submitterUsername || 'Unknown'}">
                    <span class="material-symbols-outlined">person</span>
                    <span>@${bot.submitterUsername || '...'}</span>
                </span>
            </div>
        </div>
        ${context === 'profile' ? `
            <div class="bot-actions">
                <button class="edit-bot-button icon-button" data-bot-id="${bot.id}" title="Edit Bot"><span class="material-symbols-outlined">edit</span></button>
                <button class="boost-bot-button icon-button" data-bot-id="${bot.id}" title="Boost Bot"><span class="material-symbols-outlined">rocket_launch</span></button>
            </div>
        ` : ''}
    `;

    // Event Listeners (Moved inside, cleaner)
    const likeButton = card.querySelector('.like-button');
    if (likeButton) {
        likeButton.addEventListener('click', (e) => {
            e.stopPropagation(); handleLikeBot(bot.id);
        });
    }
    if (context === 'home') {
         card.addEventListener('click', () => showBotDetails(bot.id));
    }
    if (context === 'profile') {
         const editButton = card.querySelector('.edit-bot-button');
         const boostButton = card.querySelector('.boost-bot-button');
         if (editButton) editButton.addEventListener('click', (e) => { e.stopPropagation(); handleEditBot(bot.id); });
         if (boostButton) boostButton.addEventListener('click', (e) => { e.stopPropagation(); handleBoostBot(bot.id); });
    }

    return card;
}

function showBotDetails(botId) {
    const bot = allBots[botId];
    if (!bot) {
        showInfoPopup("Error", "Bot details not found.");
        return;
    }
    currentOpenBotId = botId; // Set the currently open bot

    detailBotName.textContent = bot.name;
    botDetailContent.innerHTML = `
        ${bot.imageLink ? `<img src="${bot.imageLink}" alt="${bot.name}" onerror="this.style.display='none';">` : '<div style="height: 20px;"></div>'}
        <p id="detail-description">${bot.description || 'No description available.'}</p>
        <div id="detail-meta">
            <p><strong>Link:</strong> <span><a href="${bot.link}" target="_blank" rel="noopener noreferrer">${bot.link}</a></span></p>
            ${bot.telegramCommunity ? `<p><strong>Community:</strong> <span><a href="${bot.telegramCommunity}" target="_blank" rel="noopener noreferrer">${bot.telegramCommunity}</a></span></p>` : ''}
            ${bot.airdropName ? `<p><strong>Airdrop:</strong> <span>${bot.airdropName} ${bot.airdropPoints ? `(${formatNumber(bot.airdropPoints)} pts)` : ''}</span></p>` : ''}
            <p><strong>Submitted by:</strong> <span>@${bot.submitterUsername || 'Unknown'}</span></p>
            <p><strong>Submitted on:</strong> <span>${new Date(bot.createdAt || 0).toLocaleDateString()}</span></p>
        </div>
        <div id="detail-like-section">
            <button class="button" id="detail-like-button" data-bot-id="${bot.id}">
                <span class="material-symbols-outlined"></span> <span class="like-text">Like</span>
            </button>
            <span id="detail-like-count" class="points-display">${formatNumber(bot.likesCount)} Likes</span>
        </div>
    `;
    updateBotDetailLikeSection(bot); // Set initial like button state

    // Add listener for the detail page like button AFTER innerHTML is set
    const detailLikeButton = botDetailContent.querySelector('#detail-like-button');
    if (detailLikeButton) {
        detailLikeButton.addEventListener('click', (e) => {
            e.stopPropagation(); handleLikeBot(bot.id, true);
        });
    }

    // Show page and attach comment listener
    showPage('bot-detail-page');
    listenForComments(botId); // Start listening for comments for this specific bot
    commentInput.value = ''; // Clear comment input when opening
}

// Separate function to update just the like button/count on detail page
function updateBotDetailLikeSection(botData) {
    if (!botData || currentOpenBotId !== botData.id) return; // Only update if correct bot is open

    const isLiked = userProfile.likedBots && userProfile.likedBots[botData.id];
    const likeButton = botDetailContent.querySelector('#detail-like-button');
    const likeCountSpan = botDetailContent.querySelector('#detail-like-count');

    if (likeButton) {
        likeButton.classList.toggle('liked', isLiked);
        likeButton.classList.toggle('error-bg', isLiked); // Use error color for liked
        likeButton.querySelector('.material-symbols-outlined').textContent = isLiked ? 'favorite' : 'favorite_border';
        likeButton.querySelector('.like-text').textContent = isLiked ? 'Unlike' : 'Like';
    }
    if (likeCountSpan) {
        likeCountSpan.textContent = `${formatNumber(botData.likesCount || 0)} Likes`;
    }
}

function updateLikeButtonUI(botId, isLiked, newCount) {
    const formattedCount = formatNumber(newCount);

    // Update card on home/profile page lists
    document.querySelectorAll(`.bot-card[data-bot-id="${botId}"]`).forEach(card => {
        const likeButton = card.querySelector('.like-button');
        const countSpan = card.querySelector('.like-count');
        if (likeButton) {
            likeButton.classList.toggle('liked', isLiked);
            likeButton.querySelector('.material-symbols-outlined').textContent = isLiked ? 'favorite' : 'favorite_border';
        }
        if (countSpan) countSpan.textContent = formattedCount;
    });

    // Update button on detail page if it's open for this bot
    if (currentOpenBotId === botId && allBots[botId]) {
        updateBotDetailLikeSection(allBots[botId]); // Use the dedicated function
    }
}

// --- Comments UI ---
function createCommentCard(commentData, commentId, isOwner) {
    const card = document.createElement('div');
    card.className = 'comment-card';
    card.dataset.commentId = commentId;

    // Add reply indication later if implementing replies
    // if (commentData.replyTo) card.classList.add('is-reply');

    const timestamp = commentData.timestamp ? new Date(commentData.timestamp).toLocaleString() : 'Just now';

    card.innerHTML = `
        <div class="comment-header">
            <span class="comment-author">
                ${isOwner ? '<span class="material-symbols-outlined" title="Bot Uploader">verified_user</span>' : ''}
                @${commentData.username || 'User'}
            </span>
            <span class="comment-timestamp">${timestamp}</span>
        </div>
        <p class="comment-text">${escapeHTML(commentData.text)}</p>
        <!-- Add Reply Button Here Later -->
    `;
    return card;
}

// --- Chat UI ---
function createChatMessageElement(msgData) {
    const messageDiv = document.createElement('div');
    const isSent = msgData.userId === currentUser.id;
    messageDiv.classList.add('chat-message', isSent ? 'sent' : 'received');

    const timestamp = msgData.timestamp ? new Date(msgData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    // Basic escaping to prevent HTML injection in chat
    const safeText = escapeHTML(msgData.text);
    const senderName = escapeHTML(msgData.firstName || msgData.username || 'User');

    messageDiv.innerHTML = `
        ${!isSent ? `<span class="message-sender">@${senderName}</span>` : ''}
        <span class="message-text">${safeText}</span>
        <span class="message-timestamp">${timestamp}</span>
    `;
    return messageDiv;
}

function scrollToChatBottom() {
    // chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    // With column-reverse, we might not need explicit scrolling,
    // but let's keep it in case of initial load issues.
     requestAnimationFrame(() => {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    });
}

// Helper to prevent basic HTML injection
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, ''');
}


// --- Actions & Event Handlers ---
function setupEventListeners() {
    // Navigation
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const pageId = button.dataset.page;
            if (pageId) {
                showPage(pageId);
                tg.HapticFeedback.impactOccurred('light');
            }
        });
    });
    addBotNavButton.addEventListener('click', () => { openAddBotPopup(); tg.HapticFeedback.impactOccurred('light'); });
    backToHomeButton.addEventListener('click', () => showPage('home-page'));

    // Search & Tabs
    searchInput.addEventListener('input', debounce(displayBots, 300)); // Debounce search
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.classList.contains('active')) return; // No action if already active
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            displayBots();
        });
    });

    // Popups
    closePopupButtons.forEach(button => {
        button.addEventListener('click', () => {
            const popupId = button.dataset.popup || button.closest('.popup')?.id;
            if (popupId) closePopup(popupId);
        });
    });

    // Forms
    addBotForm.addEventListener('submit', handleAddBotSubmit);
    addCommentForm.addEventListener('submit', handleAddComment);
    chatForm.addEventListener('submit', handleSendMessage);

    // Profile & Global Actions
    profileEarnAdsButton.addEventListener('click', handleEarnAdsClick); // Profile button
    homeEarnAdsButton.addEventListener('click', handleEarnAdsClick);    // FAB button

    // Boost Actions
    boostOptions.forEach(button => {
        button.addEventListener('click', handleBoostSelection);
    });
}

// Debounce utility
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
}

function openPopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.style.display = 'flex'; // Use style.display to ensure transition works
        setTimeout(() => popup.classList.add('active-popup'), 10); // Add class after display for transition
    }
}

function closePopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.classList.remove('active-popup');
        // Wait for transition to finish before hiding
        popup.addEventListener('transitionend', () => {
            popup.style.display = 'none';
        }, { once: true }); // Remove listener after it runs once

        // Reset specific popups
         if (popupId === 'add-bot-popup') {
             addBotForm.reset();
             document.getElementById('edit-bot-id').value = '';
             document.getElementById('submit-bot-button').textContent = 'Add Bot';
              addBotPopup.querySelector('h2').textContent = 'Add New Bot';
         }
         if (popupId === 'boost-popup') {
             boostStatus.textContent = '';
             boostBotIdInput.value = '';
             boostOptions.forEach(btn => btn.disabled = false);
         }
         if (popupId === 'info-popup') {
             // Optionally clear title/message if needed
         }
    }
}

function showInfoPopup(title, message) {
    infoPopupTitle.textContent = title;
    infoPopupMessage.textContent = message;
    openPopup('info-popup');
}


// --- Add/Edit Bot Logic (Mostly Unchanged, ensure validation) ---
function openAddBotPopup(editBotData = null) {
     addBotForm.reset();
    const submitButton = document.getElementById('submit-bot-button');
    const editBotIdInput = document.getElementById('edit-bot-id');

    if (editBotData) {
        // Populate for editing (ensure fields exist in editBotData)
        document.getElementById('bot-name').value = editBotData.name || '';
        document.getElementById('bot-description').value = editBotData.description || '';
        document.getElementById('bot-link').value = editBotData.link || '';
        document.getElementById('bot-image').value = editBotData.imageLink || '';
        document.getElementById('bot-community').value = editBotData.telegramCommunity || '';
        document.getElementById('bot-airdrop-name').value = editBotData.airdropName || '';
        document.getElementById('bot-airdrop-points').value = editBotData.airdropPoints || '';
        document.getElementById('bot-active').checked = editBotData.active; // Should exist now
        editBotIdInput.value = editBotData.id;
        submitButton.textContent = 'Update Bot';
        addBotPopup.querySelector('h2').textContent = 'Edit Bot';
    } else {
        editBotIdInput.value = '';
        submitButton.textContent = 'Add Bot';
        addBotPopup.querySelector('h2').textContent = 'Add New Bot';
        document.getElementById('bot-active').checked = true;
    }
    openPopup('add-bot-popup');
}

async function handleAddBotSubmit(event) {
    event.preventDefault();
    if (!currentUser || !db) return;

    const submitButton = document.getElementById('submit-bot-button');
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    const botIdToEdit = document.getElementById('edit-bot-id').value;
    const airdropPointsInput = document.getElementById('bot-airdrop-points').value;

    const botData = {
        name: document.getElementById('bot-name').value.trim(),
        description: document.getElementById('bot-description').value.trim(),
        link: document.getElementById('bot-link').value.trim(),
        imageLink: document.getElementById('bot-image').value.trim() || null,
        telegramCommunity: document.getElementById('bot-community').value.trim() || null,
        airdropName: document.getElementById('bot-airdrop-name').value.trim() || null,
         // Parse points carefully, store as number or null
        airdropPoints: airdropPointsInput ? parseInt(airdropPointsInput, 10) : null,
        active: document.getElementById('bot-active').checked,
        submitterId: botIdToEdit ? allBots[botIdToEdit]?.submitterId : currentUser.id,
        submitterUsername: botIdToEdit ? allBots[botIdToEdit]?.submitterUsername : (currentUser.username || `user${currentUser.id}`),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    // Validate airdrop points if provided
     if (botData.airdropPoints !== null && isNaN(botData.airdropPoints)) {
         showInfoPopup("Validation Error", "Airdrop Points must be a valid number.");
         botData.airdropPoints = null; // or keep invalid value depending on preference
     }


    // Enhanced Validation
    if (!botData.name || !botData.description || !botData.link || !botData.link.startsWith('https://t.me/')) {
        showInfoPopup("Validation Error", "Please fill required fields (*). Bot Link must start with https://t.me/");
        submitButton.disabled = false;
        submitButton.textContent = botIdToEdit ? 'Update Bot' : 'Add Bot';
        return;
    }

    try {
        if (botIdToEdit) {
            if (allBots[botIdToEdit]?.submitterId !== currentUser.id) {
                 throw new Error("Permission denied to edit this bot.");
            }
            const botRef = db.ref(`bots/${botIdToEdit}`);
            // Remove fields that shouldn't be updated directly if needed (like createdAt)
            delete botData.createdAt; // Don't overwrite creation timestamp
            await botRef.update(botData);
            showInfoPopup("Success", "Bot updated successfully!");
        } else {
            botData.createdAt = firebase.database.ServerValue.TIMESTAMP;
            botData.likesCount = 0;
            botData.boostEndDate = 0;
            const newBotRef = db.ref('bots').push();
            await newBotRef.set(botData);
            showInfoPopup("Success", "Bot added successfully!");
        }
        closePopup('add-bot-popup');
        tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
        console.error("Error saving bot:", error);
        showInfoPopup("Error", `Failed to save bot: ${error.message}`);
        tg.HapticFeedback.notificationOccurred('error');
        submitButton.disabled = false; // Re-enable on error
        submitButton.textContent = botIdToEdit ? 'Update Bot' : 'Add Bot';
    }
    // No need for 'finally' block if handled in closePopup and catch
}

function handleEditBot(botId) {
     const botToEdit = allBots[botId];
     if (botToEdit && botToEdit.submitterId === currentUser.id) {
         openAddBotPopup(botToEdit);
     } else {
         showInfoPopup("Permission Denied", "You can only edit your own bots.");
     }
 }


// --- Like Logic (Add submitter point logic) ---
async function handleLikeBot(botId, isFromDetailPage = false) {
    if (!currentUser || !db || !botId || !allBots[botId]) return;

    const botRef = db.ref(`bots/${botId}`);
    const userLikesRef = db.ref(`users/${currentUser.id}/likedBots/${botId}`);
    const botData = allBots[botId]; // Get local copy

    // Optional: Prevent liking own bot
    // if (botData.submitterId === currentUser.id) {
    //     showInfoPopup("Info", "Cannot like your own bot.");
    //     return;
    // }

    tg.HapticFeedback.impactOccurred('medium'); // Stronger feedback for like

    const currentlyLiked = userProfile.likedBots && userProfile.likedBots[botId];
    const newLikedState = !currentlyLiked;

    try {
        // --- Optimistic UI Update ---
        const estimatedNewCount = (botData.likesCount || 0) + (newLikedState ? 1 : -1);
        if (estimatedNewCount >= 0) { // Only update UI if count won't go negative
            updateLikeButtonUI(botId, newLikedState, estimatedNewCount);
            // Update local cache optimistically too
             if (newLikedState) {
                if (!userProfile.likedBots) userProfile.likedBots = {};
                userProfile.likedBots[botId] = true;
            } else {
                 if (userProfile.likedBots) delete userProfile.likedBots[botId];
            }
        }
        // --- Update Firebase ---
        // 1. Update Like Count (Transaction)
        const countUpdate = await botRef.child('likesCount').transaction(currentCount => {
             const count = currentCount || 0;
             if (newLikedState) { // Liking
                 return count + 1;
             } else { // Unliking
                  return count > 0 ? count - 1 : 0; // Prevent negative
             }
        });

        if (!countUpdate.committed) throw new Error("Like count transaction failed.");

        const finalLikesCount = countUpdate.snapshot.val();

         // 2. Update User's Liked List
         await userLikesRef.set(newLikedState ? true : null); // true for like, null to delete for unlike


        // 3. Award points to submitter (ONLY on successful LIKE action)
        // Check if it was a 'like' action (newLikedState is true)
        // Check if submitter exists and is not the current user
        if (newLikedState && botData.submitterId && botData.submitterId !== currentUser.id) {
            const submitterPointsRef = db.ref(`users/${botData.submitterId}/points`);
            // Use transaction for points update
            await submitterPointsRef.transaction(currentPoints => {
                 return (currentPoints || 0) + LIKE_REWARD_POINTS;
            });
            console.log(`Awarded ${LIKE_REWARD_POINTS} points to user ${botData.submitterId}`);
        }

         // --- Final UI Update (with actual count from DB) ---
         // Update local bot cache with actual count
         allBots[botId].likesCount = finalLikesCount;
         updateLikeButtonUI(botId, newLikedState, finalLikesCount);

        console.log(`Like/Unlike success for bot ${botId}. Liked: ${newLikedState}`);

    } catch (error) {
        console.error("Error liking/unliking bot:", error);
        showInfoPopup("Like Error", "Could not update like status. Please try again.");
        // --- Revert Optimistic UI Update on Failure ---
         updateLikeButtonUI(botId, currentlyLiked, botData.likesCount); // Revert to original state
          if (currentlyLiked) { // If original state was 'liked'
            if (!userProfile.likedBots) userProfile.likedBots = {};
             userProfile.likedBots[botId] = true;
         } else { // If original state was 'not liked'
             if (userProfile.likedBots) delete userProfile.likedBots[botId];
         }
    }
}


// --- Points & Ads Logic (Daily Share Removed) ---
async function updateUserPoints(pointsToAdd) {
    if (!currentUser || !db || pointsToAdd === 0 || isNaN(pointsToAdd)) return false;

    const userPointsRef = db.ref(`users/${currentUser.id}/points`);
    try {
        const result = await userPointsRef.transaction(currentPoints => {
            const basePoints = (typeof currentPoints === 'number') ? currentPoints : 0;
            const newPoints = basePoints + pointsToAdd;
             // Ensure points don't go negative (unless intended, e.g., spending)
            return newPoints < 0 ? 0 : newPoints;
        });

        if (result.committed) {
            userProfile.points = result.snapshot.val();
            updateProfileUI(); // Update display with formatted number
            console.log(`Points updated by ${pointsToAdd}. New total: ${userProfile.points}`);
            return true;
        } else {
            console.warn("Points transaction aborted.");
            return false;
        }
    } catch (error) {
        console.error("Error updating points:", error);
        showInfoPopup("Points Error", "Failed to update points.");
        return false;
    }
}

function handleEarnAdsClick(event) {
    const button = event.target.closest('button'); // Get the button element
     if (!button) return; // Should not happen

    const now = Date.now();
    const lastWatch = userProfile.lastAdWatch || 0;

    if (now - lastWatch < AD_COOLDOWN_MS) {
        const remaining = Math.ceil((AD_COOLDOWN_MS - (now - lastWatch)) / 1000);
        showInfoPopup("Cooldown", `Please wait ${remaining} more seconds before watching another ad.`);
        return;
    }

    if (typeof show_9263144 !== 'function') {
         showInfoPopup("Ad Error", "Ad system not available. Please try again later.");
         return;
    }

    button.disabled = true;
    const originalContent = button.innerHTML;
    button.innerHTML = `<div class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0 auto;"></div>`;
    showInfoPopup("Loading Ad", "Please wait, loading advertisement...");

    show_9263144().then(async () => {
        console.log("Ad watched.");
        closePopup('info-popup'); // Close loading popup
        showInfoPopup("Success!", `Ad finished! You earned ${formatNumber(AD_REWARD_POINTS)} points.`);
        tg.HapticFeedback.notificationOccurred('success');

        // Update last watch time *before* updating points (or together in transaction if critical)
         try {
            await db.ref(`users/${currentUser.id}/lastAdWatch`).set(Date.now());
            userProfile.lastAdWatch = Date.now(); // Update local cache
         } catch (timeError) {
             console.error("Failed to update last ad watch time:", timeError);
             // Proceed with points update anyway? Or show error?
         }

        const pointsUpdated = await updateUserPoints(AD_REWARD_POINTS);
         if (!pointsUpdated) {
             showInfoPopup("Points Error", "Ad watched, but failed to update points. Contact support.");
         }

    }).catch((error) => {
        console.warn("Ad SDK error or ad closed:", error);
        closePopup('info-popup');
        showInfoPopup("Ad Not Completed", "Ad closed or failed. No points awarded.");
        tg.HapticFeedback.notificationOccurred('warning');
    }).finally(() => {
        button.disabled = false;
        button.innerHTML = originalContent; // Restore button content
    });
}

// --- Boost Logic (Use formatNumber) ---
 function handleBoostBot(botId) {
     const bot = allBots[botId];
     if (!bot || bot.submitterId !== currentUser.id) {
         showInfoPopup("Error", "Bot not found or you don't own it.");
         return;
     }

     boostBotIdInput.value = botId;
     boostStatus.textContent = '';

     boostOptions.forEach(button => {
         const cost = parseInt(button.dataset.cost);
         button.disabled = userProfile.points < cost;
         // Update text with formatted numbers
         const duration = button.dataset.duration;
         button.innerHTML = `Boost for ${duration} Day${duration > 1 ? 's': ''} (${formatNumber(cost)} Pts)`;
         if (button.disabled) button.title = "Not enough points"; else button.title = "";
     });

     openPopup('boost-popup');
 }

 async function handleBoostSelection(event) {
     const button = event.target.closest('.boost-option');
     const botId = boostBotIdInput.value;
     const durationDays = parseInt(button.dataset.duration);
     const cost = parseInt(button.dataset.cost);

     if (!botId || !durationDays || !cost || !allBots[botId]) {
         boostStatus.textContent = 'Error: Invalid selection.'; return;
     }
     if (userProfile.points < cost) {
         boostStatus.textContent = 'Error: Not enough points.'; return;
     }

     boostOptions.forEach(btn => btn.disabled = true);
     boostStatus.textContent = 'Processing boost...';
     tg.HapticFeedback.impactOccurred('heavy');

     // 1. Deduct points
     const pointsDeducted = await updateUserPoints(-cost);
     if (!pointsDeducted) {
         boostStatus.textContent = 'Error: Failed to deduct points.';
         boostOptions.forEach(btn => btn.disabled = userProfile.points < parseInt(btn.dataset.cost));
         return;
     }

     // 2. Calculate and set boost end date
     const now = Date.now();
     const currentBoostEnd = allBots[botId].boostEndDate || 0;
     const boostStartDate = Math.max(now, currentBoostEnd);
     const newBoostEndDate = boostStartDate + (durationDays * 24 * 60 * 60 * 1000);

     const botBoostRef = db.ref(`bots/${botId}/boostEndDate`);
     try {
         await botBoostRef.set(newBoostEndDate);
         // Update local cache
         allBots[botId].boostEndDate = newBoostEndDate;

         boostStatus.textContent = `Success! Bot boosted for ${durationDays} day(s).`;
         tg.HapticFeedback.notificationOccurred('success');
         displayBots(); updateMyBotsList(); // Refresh relevant lists

         setTimeout(() => closePopup('boost-popup'), 2500);

     } catch (error) {
         console.error("Error setting boost end date:", error);
         boostStatus.textContent = 'Points deducted, but failed to set boost. Contact support.';
         // !!! CRITICAL: Implement point refund logic here for production !!!
         // Example: await updateUserPoints(cost); // Attempt refund (needs robust check)
         tg.HapticFeedback.notificationOccurred('error');
     }
 }

 // --- Comment Handling ---
 async function handleAddComment(event) {
     event.preventDefault();
     const text = commentInput.value.trim();
     if (!text || !currentOpenBotId || !currentUser || !db) return;

     const commentButton = addCommentForm.querySelector('button[type="submit"]');
     commentButton.disabled = true;
     const originalButtonText = commentButton.innerHTML;
     commentButton.innerHTML = `<div class="spinner" style="width: 18px; height: 18px; border-width: 2px; margin: 0 auto;"></div> Posting...`;

     const botOwnerId = allBots[currentOpenBotId]?.submitterId;
     const isOwnerReply = botOwnerId === currentUser.id; // Check if commenter is the bot owner

     const commentData = {
         userId: currentUser.id,
         username: currentUser.username || `user${currentUser.id}`,
         firstName: currentUser.first_name || '', // Store first name too
         text: text,
         timestamp: firebase.database.ServerValue.TIMESTAMP,
         isOwnerComment: isOwnerReply, // Flag if it's the owner posting
         // replyTo: null // Add later if implementing direct replies
     };

     try {
         await db.ref(`bots/${currentOpenBotId}/comments`).push(commentData);
         commentInput.value = ''; // Clear input on success
         tg.HapticFeedback.notificationOccurred('success');
         // No need to manually add to UI, the listener will pick it up
     } catch (error) {
         console.error("Error posting comment:", error);
         showInfoPopup("Comment Error", "Failed to post comment. Please try again.");
         tg.HapticFeedback.notificationOccurred('error');
     } finally {
         commentButton.disabled = false;
         commentButton.innerHTML = originalButtonText;
     }
 }

 // --- Chat Message Handling ---
 async function handleSendMessage(event) {
     event.preventDefault();
     const text = chatInput.value.trim();
     if (!text || !currentUser || !db) return;

     const sendButton = chatForm.querySelector('button[type="submit"]');
     sendButton.disabled = true; // Disable while sending

     const messageData = {
         userId: currentUser.id,
         username: currentUser.username || `user${currentUser.id}`,
         firstName: currentUser.first_name || '',
         text: text,
         timestamp: firebase.database.ServerValue.TIMESTAMP
     };

     try {
         await db.ref('chatMessages').push(messageData);
         chatInput.value = ''; // Clear input on success
         // Optional: Haptic feedback for message sent
         // tg.HapticFeedback.impactOccurred('light');
         // Scroll to bottom should happen automatically due to listener update + CSS
         // scrollToChatBottom(); // Explicit scroll just in case
     } catch (error) {
         console.error("Error sending chat message:", error);
         showInfoPopup("Chat Error", "Failed to send message.");
         // Re-enable button? Or leave disabled until user retries?
     } finally {
         // Re-enable button quickly unless there was a persistent error
         setTimeout(() => { sendButton.disabled = false; }, 200); // Small delay
     }
 }

// --- Start the App ---
initializeApp();
