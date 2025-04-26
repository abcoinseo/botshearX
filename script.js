const firebaseConfig = {
    apiKey: "AIzaSyBW1WPXUN8DYhT6npZQYoQ3l4J-jFSbzfg", // Replace if needed, but use Rules!
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
let userProfile = { points: 0, lastDailyShare: 0, likedBots: {} };
let allBots = {}; // Store all fetched bots { botId: botData }
let currentBotList = []; // Bots currently displayed based on filter/search
let currentOpenBotId = null; // For detail view
let currentEditBotId = null; // For editing bot
let adCooldown = false; // Simple flag for ad cooldown
const DAILY_SHARE_POINTS = 50; // Example points
const LIKE_REWARD_POINTS = 10; // Points for receiving a like
const AD_REWARD_POINTS = 10;
const AD_COOLDOWN_MS = 30 * 1000; // 30 seconds

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
const dailyShareButton = document.getElementById('daily-share-button');
const earnAdsButton = document.getElementById('earn-ads-button');

// Popups & Forms
const addBotPopup = document.getElementById('add-bot-popup');
const dailySharePopup = document.getElementById('daily-share-popup');
const boostPopup = document.getElementById('boost-popup');
const infoPopup = document.getElementById('info-popup');
const addBotForm = document.getElementById('add-bot-form');
const closePopupButtons = document.querySelectorAll('.close-popup, .cancel-button[data-popup]');
const claimDailyShareButton = document.getElementById('claim-daily-share-button');
const dailyShareStatus = document.getElementById('daily-share-status');
const dailyShareAmount = document.getElementById('daily-share-amount');
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


// --- Initialization ---
function initializeApp() {
    tg.ready();
    tg.expand(); // Expand the webapp view

    // --- Check if running inside Telegram ---
    if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
    // if (!tg.initData || tg.initData === "") { // Use this for production check
        showError("This app can only be launched from Telegram.");
        tg.close(); // Close if not in Telegram (optional)
        return;
    }

    currentUser = tg.initDataUnsafe.user;
    // For production, you would VERIFY tg.initData on your backend first!

    // --- Initialize Firebase ---
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        console.log("Firebase Initialized");
        fetchInitialData();
    } catch (error) {
        console.error("Firebase Init Error:", error);
        showError("Failed to connect to the database.");
    }

    // --- Setup Event Listeners ---
    setupEventListeners();

    // --- Show Home Page ---
    showPage('home-page'); // Start with home
    loadingScreen.classList.remove('active-page');
    dailyShareAmount.textContent = DAILY_SHARE_POINTS; // Set points display in popup
}

function showError(message) {
    loadingScreen.classList.add('active-page'); // Show loading screen container
    loadingScreen.querySelector('p').textContent = "Error"; // Change text
    loadingScreen.querySelector('.spinner').style.display = 'none'; // Hide spinner
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    console.error(message);
    // Hide other pages if necessary
    pages.forEach(p => { if (p.id !== 'loading-screen') p.classList.remove('active-page') });
}

// --- Data Fetching ---
async function fetchInitialData() {
    if (!currentUser || !db) return;

    await fetchUserProfile(); // Get user points, likes etc.
    listenForBots(); // Start listening for bot updates
    // Initial display will happen inside listenForBots callback
}

async function fetchUserProfile() {
    const userRef = db.ref(`users/${currentUser.id}`);
    try {
        const snapshot = await userRef.once('value');
        if (snapshot.exists()) {
            userProfile = { ...userProfile, ...snapshot.val() };
             // Ensure likedBots is an object
            if (!userProfile.likedBots || typeof userProfile.likedBots !== 'object') {
                userProfile.likedBots = {};
            }
            console.log("User profile loaded:", userProfile);
        } else {
            // Create initial profile if it doesn't exist
            console.log("Creating new user profile");
            await userRef.set({
                id: currentUser.id,
                firstName: currentUser.first_name || '',
                lastName: currentUser.last_name || '',
                username: currentUser.username || 'N/A',
                points: 0,
                lastDailyShare: 0,
                likedBots: {}, // Initialize likedBots
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            userProfile.points = 0; // Update local state
            userProfile.lastDailyShare = 0;
            userProfile.likedBots = {};
        }
        updateProfileUI(); // Update UI after fetching/creating
    } catch (error) {
        console.error("Error fetching user profile:", error);
        showInfoPopup("Error", "Could not load your profile data.");
    }
}

function listenForBots() {
    const botsRef = db.ref('bots');
    // Use '.on' for real-time updates
    botsRef.orderByChild('createdAt').on('value', (snapshot) => {
        allBots = {}; // Reset local cache
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const botData = childSnapshot.val();
                // Only include active bots OR bots submitted by the current user (for editing)
                if (botData && (botData.active === true || botData.submitterId === currentUser.id)) {
                     // Ensure basic fields exist for sorting/display
                    allBots[childSnapshot.key] = {
                        id: childSnapshot.key, // Add the Firebase key as id
                        ...botData,
                        likesCount: botData.likesCount || 0,
                        createdAt: botData.createdAt || 0,
                        boostEndDate: botData.boostEndDate || 0,
                         active: botData.active !== undefined ? botData.active : true // Default to active if missing
                    };
                }
            });
        } else {
            console.log("No bots found in database.");
        }
        console.log("Bots updated:", Object.keys(allBots).length);
        // Trigger display update after data is fetched/updated
        displayBots();
        updateMyBotsList(); // Update profile page too
    }, (error) => {
        console.error("Error listening for bots:", error);
        botListContainer.innerHTML = '<p class="placeholder">Error loading bots.</p>';
    });
}


// --- UI Updates ---
function showPage(pageId) {
    pages.forEach(page => {
        page.classList.toggle('active-page', page.id === pageId);
    });
    // Update active nav button
    navButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.page === pageId);
    });
    addBotNavButton.classList.remove('active'); // Deactivate add button visually

    // Refresh data if needed when switching to certain pages
    if (pageId === 'profile-page') {
        updateProfileUI();
        updateMyBotsList(); // Make sure the list is current
    }
    if (pageId === 'home-page') {
         // Reset scroll and filters if needed
        document.getElementById('home-page').scrollTop = 0;
        // displayBots(); // Re-filter/sort if needed
    }
     // Clear search when leaving home page (optional)
    if (pageId !== 'home-page') {
        searchInput.value = '';
    }
    // Hide detail page if navigating away
    if(pageId !== 'bot-detail-page') {
        currentOpenBotId = null;
        botDetailPage.classList.remove('active-page');
    }
}

function updateProfileUI() {
    if (!currentUser) return;
    profileName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`;
    profileUsername.textContent = currentUser.username ? `@${currentUser.username}` : 'Not set';
    profileChatId.textContent = currentUser.id;
    profilePoints.textContent = userProfile.points || 0;
}

function displayBots() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'all';

    // 1. Filter based on search and active status
    let filteredBots = Object.values(allBots).filter(bot => {
        const isMatch = (
            (bot.name?.toLowerCase() || '').includes(searchTerm) ||
            (bot.description?.toLowerCase() || '').includes(searchTerm)
        );
         // Always show user's own inactive bots on their profile, but filter here for home page
        return isMatch && bot.active === true;
    });


    // 2. Sort based on the active tab
    const now = Date.now();
    currentBotList = filteredBots.sort((a, b) => {
        const aIsBoosted = a.boostEndDate && a.boostEndDate > now;
        const bIsBoosted = b.boostEndDate && b.boostEndDate > now;

        // Prioritize boosted bots
        if (aIsBoosted && !bIsBoosted) return -1;
        if (!aIsBoosted && bIsBoosted) return 1;
        // If both are boosted (or not boosted), sort by criteria
        if (aIsBoosted && bIsBoosted) {
            // Boosted sorted by remaining time (longer first) or creation date? Let's use likes for now.
             return (b.likesCount || 0) - (a.likesCount || 0);
        }

        // Non-boosted sorting
        if (activeTab === 'trending') {
             // Simple trending: combination of recent + likes (adjust weights as needed)
             // Example: score = likes + (time_factor * recency_score)
            const recencyA = Math.max(0, 1 - (now - (a.createdAt || 0)) / (7 * 24 * 60 * 60 * 1000)); // Normalize over 1 week
            const recencyB = Math.max(0, 1 - (now - (b.createdAt || 0)) / (7 * 24 * 60 * 60 * 1000));
            const scoreA = (a.likesCount || 0) + 5 * recencyA; // Weight recency
            const scoreB = (b.likesCount || 0) + 5 * recencyB;
            return scoreB - scoreA;
        } else if (activeTab === 'top-liked') {
            return (b.likesCount || 0) - (a.likesCount || 0); // Sort by likes descending
        } else { // 'all' or default
            return (b.createdAt || 0) - (a.createdAt || 0); // Sort by newest first
        }
    });

    // 3. Render the sorted list
    botListContainer.innerHTML = ''; // Clear previous list
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
    myBotsList.innerHTML = ''; // Clear previous list
    const userBots = Object.values(allBots)
        .filter(bot => bot.submitterId === currentUser.id)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Sort by newest first

    if (userBots.length === 0) {
        myBotsList.innerHTML = '<p class="placeholder">You haven\'t added any bots yet.</p>';
        return;
    }

    userBots.forEach(bot => {
        const card = createBotCard(bot, 'profile'); // Pass 'profile' context
        myBotsList.appendChild(card);
    });
}


function createBotCard(bot, context = 'home') {
    const card = document.createElement('div');
    card.className = 'bot-card';
    card.dataset.botId = bot.id;

    const isLiked = userProfile.likedBots && userProfile.likedBots[bot.id];
    const likeIcon = isLiked ? 'favorite' : 'favorite_border';
    const likeButtonClass = isLiked ? 'like-button liked' : 'like-button';
     const now = Date.now();
     const isBoosted = bot.boostEndDate && bot.boostEndDate > now;

    card.innerHTML = `
        <img src="${bot.imageLink || 'https://via.placeholder.com/50/444/888?text=Bot'}" alt="${bot.name}" class="bot-image" onerror="this.src='https://via.placeholder.com/50/444/888?text=Bot';">
        <div class="bot-info">
            <h3>
                ${bot.name || 'Unnamed Bot'}
                ${isBoosted ? '<span class="material-symbols-outlined" style="font-size: 1em; color: #ffc107; vertical-align: middle;" title="Boosted">rocket_launch</span>' : ''}
                ${bot.active === false ? '<span style="color: #ff9800; font-size: 0.8em;"> (Inactive)</span>': ''}
            </h3>
            <p>${bot.description || 'No description.'}</p>
            <div class="bot-meta">
                <span class="likes">
                    <button class="${likeButtonClass}" data-bot-id="${bot.id}" title="Like Bot">
                        <span class="material-symbols-outlined">${likeIcon}</span>
                    </button>
                    <span class="like-count">${bot.likesCount || 0}</span>
                </span>
                <span class="submitter">
                    <span class="material-symbols-outlined" style="font-size: 1em;">person</span>
                    <span>${bot.submitterUsername || 'Unknown'}</span>
                </span>
            </div>
        </div>
        ${context === 'profile' ? `
            <div class="bot-actions">
                <button class="edit-bot-button" data-bot-id="${bot.id}" title="Edit Bot"><span class="material-symbols-outlined" style="font-size: 1.2em;">edit</span></button>
                <button class="boost-bot-button" data-bot-id="${bot.id}" title="Boost Bot"><span class="material-symbols-outlined" style="font-size: 1.2em;">rocket_launch</span></button>
            </div>
        ` : ''}
    `;

    // Add event listener for the like button within this card
    const likeButton = card.querySelector('.like-button');
    if (likeButton) {
        likeButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click when liking
            handleLikeBot(bot.id);
        });
    }

     // Add event listener for the entire card (to show details)
     if (context === 'home') {
         card.addEventListener('click', () => {
             showBotDetails(bot.id);
         });
     }

     // Add listeners for profile actions
     if (context === 'profile') {
         const editButton = card.querySelector('.edit-bot-button');
         const boostButton = card.querySelector('.boost-bot-button');
         if (editButton) {
             editButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleEditBot(bot.id);
             });
         }
          if (boostButton) {
             boostButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleBoostBot(bot.id);
             });
         }
     }


    return card;
}

function showBotDetails(botId) {
    const bot = allBots[botId];
    if (!bot) {
        showInfoPopup("Error", "Bot details not found.");
        return;
    }
    currentOpenBotId = botId;

    detailBotName.textContent = bot.name || 'Bot Details';

    const isLiked = userProfile.likedBots && userProfile.likedBots[bot.id];
    const likeIcon = isLiked ? 'favorite' : 'favorite_border';
    const likeButtonClass = isLiked ? 'detail-like-button liked' : 'detail-like-button';

    botDetailContent.innerHTML = `
        ${bot.imageLink ? `<img src="${bot.imageLink}" alt="${bot.name}" onerror="this.style.display='none';">` : ''}
        <p id="detail-description">${bot.description || 'No description available.'}</p>
        <div id="detail-meta">
            <p><strong>Link:</strong> <a href="${bot.link}" target="_blank" rel="noopener noreferrer">${bot.link}</a></p>
            ${bot.telegramCommunity ? `<p><strong>Community:</strong> <a href="${bot.telegramCommunity}" target="_blank" rel="noopener noreferrer">${bot.telegramCommunity}</a></p>` : ''}
            ${bot.airdropName ? `<p><strong>Airdrop:</strong> ${bot.airdropName} ${bot.airdropPoints ? `(${bot.airdropPoints} points)` : ''}</p>` : ''}
            <p><strong>Submitted by:</strong> ${bot.submitterUsername || 'Unknown'}</p>
            <p><strong>Submitted on:</strong> ${new Date(bot.createdAt || 0).toLocaleDateString()}</p>
        </div>
        <div id="detail-like-section">
             <button class="${likeButtonClass}" id="detail-like-button" data-bot-id="${bot.id}">
                <span class="material-symbols-outlined">${likeIcon}</span> Like
            </button>
            <span id="detail-like-count">${bot.likesCount || 0} Likes</span>
        </div>
        <!-- Comment Section Placeholder -->
        <div id="comment-section" style="margin-top: 20px;">
            <h4>Comments</h4>
            <p class="placeholder">Commenting feature coming soon!</p>
            <!-- Add comment form and list here later -->
        </div>
    `;

     // Add listener for the detail page like button
    const detailLikeButton = botDetailContent.querySelector('#detail-like-button');
    if (detailLikeButton) {
        detailLikeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            handleLikeBot(bot.id, true); // Pass flag to update detail view
        });
    }

    showPage('bot-detail-page');
    botDetailPage.scrollTop = 0; // Scroll to top
}

function updateLikeButtonUI(botId, isLiked, newCount) {
    // Update card on home/profile page
    const cardLikeButton = botListContainer.querySelector(`.like-button[data-bot-id="${botId}"]`);
     const profileCardLikeButton = myBotsList.querySelector(`.like-button[data-bot-id="${botId}"]`);

    if (cardLikeButton) {
        cardLikeButton.classList.toggle('liked', isLiked);
        cardLikeButton.querySelector('.material-symbols-outlined').textContent = isLiked ? 'favorite' : 'favorite_border';
        const countSpan = cardLikeButton.closest('.likes').querySelector('.like-count');
        if (countSpan) countSpan.textContent = newCount;
    }
     if (profileCardLikeButton) {
        profileCardLikeButton.classList.toggle('liked', isLiked);
        profileCardLikeButton.querySelector('.material-symbols-outlined').textContent = isLiked ? 'favorite' : 'favorite_border';
        const countSpan = profileCardLikeButton.closest('.likes').querySelector('.like-count');
        if (countSpan) countSpan.textContent = newCount;
    }

    // Update button on detail page if it's open
    if (currentOpenBotId === botId) {
        const detailLikeButton = botDetailContent.querySelector('#detail-like-button');
        const detailLikeCount = botDetailContent.querySelector('#detail-like-count');
        if (detailLikeButton) {
            detailLikeButton.classList.toggle('liked', isLiked);
            detailLikeButton.querySelector('.material-symbols-outlined').textContent = isLiked ? 'favorite' : 'favorite_border';
        }
        if (detailLikeCount) {
            detailLikeCount.textContent = `${newCount} Likes`;
        }
    }
}


// --- Actions & Event Handlers ---
function setupEventListeners() {
    // Navigation
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const pageId = button.dataset.page;
            if (pageId) {
                showPage(pageId);
                // Vibrate feedback (optional)
                tg.HapticFeedback.impactOccurred('light');
            }
        });
    });

    addBotNavButton.addEventListener('click', () => {
        openAddBotPopup(); // Open as popup
         tg.HapticFeedback.impactOccurred('light');
    });

     backToHomeButton.addEventListener('click', () => {
        showPage('home-page');
    });


    // Search & Tabs
    searchInput.addEventListener('input', displayBots);
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            displayBots(); // Re-sort and display
        });
    });

    // Popups
    closePopupButtons.forEach(button => {
        button.addEventListener('click', () => {
            const popupId = button.dataset.popup || button.closest('.popup')?.id;
            if (popupId) {
                closePopup(popupId);
            }
        });
    });

    // Add Bot Form
    addBotForm.addEventListener('submit', handleAddBotSubmit);

    // Profile Actions
    dailyShareButton.addEventListener('click', openDailySharePopup);
    earnAdsButton.addEventListener('click', handleEarnAdsClick);

    // Boost Actions
    boostOptions.forEach(button => {
        button.addEventListener('click', handleBoostSelection);
    });
}

function openPopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.classList.add('active-popup');
        // Optional: disable background scroll while popup is open
        // document.body.style.overflow = 'hidden';
    }
}

function closePopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.classList.remove('active-popup');
        // Optional: re-enable background scroll
        // document.body.style.overflow = '';

        // Reset specific popups if needed
         if (popupId === 'add-bot-popup') {
             addBotForm.reset();
             document.getElementById('edit-bot-id').value = ''; // Clear edit ID
             document.getElementById('submit-bot-button').textContent = 'Add Bot';
         }
         if (popupId === 'boost-popup') {
             boostStatus.textContent = '';
             boostBotIdInput.value = '';
             boostOptions.forEach(btn => btn.disabled = false); // Re-enable options
         }
         if (popupId === 'daily-share-popup') {
             dailyShareStatus.textContent = '';
             claimDailyShareButton.disabled = false;
         }
    }
}

function showInfoPopup(title, message) {
    infoPopupTitle.textContent = title;
    infoPopupMessage.textContent = message;
    openPopup('info-popup');
}


// --- Add/Edit Bot Logic ---
function openAddBotPopup(editBotData = null) {
     addBotForm.reset(); // Clear previous entries
    const submitButton = document.getElementById('submit-bot-button');
    const editBotIdInput = document.getElementById('edit-bot-id');

    if (editBotData) {
        // Populate form for editing
        document.getElementById('bot-name').value = editBotData.name || '';
        document.getElementById('bot-description').value = editBotData.description || '';
        document.getElementById('bot-link').value = editBotData.link || '';
        document.getElementById('bot-image').value = editBotData.imageLink || '';
        document.getElementById('bot-community').value = editBotData.telegramCommunity || '';
        document.getElementById('bot-airdrop-name').value = editBotData.airdropName || '';
        document.getElementById('bot-airdrop-points').value = editBotData.airdropPoints || '';
        document.getElementById('bot-active').checked = editBotData.active !== undefined ? editBotData.active : true;
        editBotIdInput.value = editBotData.id; // Store the ID for update
        submitButton.textContent = 'Update Bot';
        addBotPopup.querySelector('h2').textContent = 'Edit Bot';

    } else {
         // Setup for adding new
        editBotIdInput.value = '';
        submitButton.textContent = 'Add Bot';
        addBotPopup.querySelector('h2').textContent = 'Add New Bot';
        document.getElementById('bot-active').checked = true; // Default to active
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

    const botData = {
        name: document.getElementById('bot-name').value.trim(),
        description: document.getElementById('bot-description').value.trim(),
        link: document.getElementById('bot-link').value.trim(),
        imageLink: document.getElementById('bot-image').value.trim() || null, // Use null if empty
        telegramCommunity: document.getElementById('bot-community').value.trim() || null,
        airdropName: document.getElementById('bot-airdrop-name').value.trim() || null,
        airdropPoints: parseInt(document.getElementById('bot-airdrop-points').value) || null,
        active: document.getElementById('bot-active').checked,
        // Fields set only on creation or fetched for update
        submitterId: botIdToEdit ? allBots[botIdToEdit]?.submitterId : currentUser.id,
        submitterUsername: botIdToEdit ? allBots[botIdToEdit]?.submitterUsername : (currentUser.username || `user${currentUser.id}`),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    // Basic Validation
    if (!botData.name || !botData.description || !botData.link || !botData.link.startsWith('https://t.me/')) {
        showInfoPopup("Validation Error", "Please fill in all required fields (*) correctly. Bot Link must start with https://t.me/");
        submitButton.disabled = false;
        submitButton.textContent = botIdToEdit ? 'Update Bot' : 'Add Bot';
        return;
    }

    try {
        if (botIdToEdit) {
            // --- Update Existing Bot ---
             // Ensure user owns the bot they are trying to edit
            if (allBots[botIdToEdit]?.submitterId !== currentUser.id) {
                 throw new Error("You don't have permission to edit this bot.");
            }
            const botRef = db.ref(`bots/${botIdToEdit}`);
            await botRef.update(botData);
            showInfoPopup("Success", "Bot updated successfully!");
        } else {
            // --- Add New Bot ---
            botData.createdAt = firebase.database.ServerValue.TIMESTAMP;
            botData.likesCount = 0; // Initialize likes
             botData.boostEndDate = 0; // Initialize boost
            const newBotRef = db.ref('bots').push();
            await newBotRef.set(botData);
            showInfoPopup("Success", "Bot added successfully!");
        }

        closePopup('add-bot-popup');
        tg.HapticFeedback.notificationOccurred('success');
        // displayBots(); // Data listener will automatically update the list
    } catch (error) {
        console.error("Error saving bot:", error);
        showInfoPopup("Error", `Failed to save bot: ${error.message}`);
        tg.HapticFeedback.notificationOccurred('error');
    } finally {
        submitButton.disabled = false;
         // Text content reset happens in closePopup
    }
}

function handleEditBot(botId) {
     const botToEdit = allBots[botId];
     if (botToEdit && botToEdit.submitterId === currentUser.id) {
         openAddBotPopup(botToEdit);
     } else {
         showInfoPopup("Permission Denied", "You can only edit bots you submitted.");
     }
 }


// --- Like Logic ---
async function handleLikeBot(botId, isFromDetailPage = false) {
    if (!currentUser || !db || !botId) return;

    const botRef = db.ref(`bots/${botId}`);
    const userLikesRef = db.ref(`users/${currentUser.id}/likedBots/${botId}`);
    const userPointsRef = db.ref(`users/${currentUser.id}/points`);
    const botData = allBots[botId];

    if (!botData) {
        console.error("Bot data not found for like:", botId);
        return;
    }

    // Prevent liking own bot (optional rule)
    // if (botData.submitterId === currentUser.id) {
    //     showInfoPopup("Info", "You cannot like your own submitted bot.");
    //     return;
    // }

    tg.HapticFeedback.impactOccurred('light');

    try {
        // Use a transaction to ensure atomicity
        const result = await botRef.transaction(currentData => {
            if (currentData === null) {
                return null; // Bot doesn't exist
            }

            // Check if user already liked using local state first for responsiveness
            const alreadyLiked = userProfile.likedBots && userProfile.likedBots[botId];

            if (alreadyLiked) {
                // --- Unlike ---
                currentData.likesCount = (currentData.likesCount || 0) - 1;
                 if (currentData.likesCount < 0) currentData.likesCount = 0; // Prevent negative counts
            } else {
                // --- Like ---
                currentData.likesCount = (currentData.likesCount || 0) + 1;
            }
            return currentData; // Return the modified data
        });

        if (result.committed && result.snapshot.exists()) {
            const newLikesCount = result.snapshot.val().likesCount;
            const botSubmitterId = result.snapshot.val().submitterId;
            const currentlyLiked = !(userProfile.likedBots && userProfile.likedBots[botId]); // Intention: true if we just liked it

            // Update user's likedBots list
            await userLikesRef.set(currentlyLiked ? true : null); // Set true if liked, null if unliked (removes node)

            // Update local state immediately for UI responsiveness
            if (!userProfile.likedBots) userProfile.likedBots = {};
             if (currentlyLiked) {
                 userProfile.likedBots[botId] = true;
             } else {
                 delete userProfile.likedBots[botId];
             }

             // Award points to the submitter if someone liked their bot (and it wasn't an unlike)
             // Only award points if it's not the submitter liking their own bot
            if (currentlyLiked && botSubmitterId && botSubmitterId !== currentUser.id) {
                const submitterPointsRef = db.ref(`users/${botSubmitterId}/points`);
                await submitterPointsRef.transaction(currentPoints => {
                    return (currentPoints || 0) + LIKE_REWARD_POINTS;
                });
                 console.log(`Awarded ${LIKE_REWARD_POINTS} points to user ${botSubmitterId} for like on bot ${botId}`);
            }
             // Decrease points if unliking (optional, can be complex/abused)
             // We won't decrease points on unlike for simplicity here.

            // Update UI
            updateLikeButtonUI(botId, currentlyLiked, newLikesCount);

            console.log(`Like/Unlike success for bot ${botId}. Liked: ${currentlyLiked}`);
        } else {
             throw new Error("Like transaction failed or bot was deleted.");
        }

    } catch (error) {
        console.error("Error liking/unliking bot:", error);
        showInfoPopup("Error", "Could not update like status. Please try again.");
        // Revert UI optimisic update if needed (complex part)
        // For now, rely on the next data fetch/listener update to correct the UI
    }
}


// --- Points & Ads Logic ---
async function updateUserPoints(pointsToAdd) {
    if (!currentUser || !db || pointsToAdd === 0) return;

    const userPointsRef = db.ref(`users/${currentUser.id}/points`);
    try {
        const result = await userPointsRef.transaction(currentPoints => {
            // Ensure currentPoints is a number, default to 0 if null/undefined
             const basePoints = (typeof currentPoints === 'number') ? currentPoints : 0;
            return basePoints + pointsToAdd;
        });

        if (result.committed) {
            userProfile.points = result.snapshot.val(); // Update local cache
            updateProfileUI(); // Update displayed points
            console.log(`Points updated by ${pointsToAdd}. New total: ${userProfile.points}`);
            return true; // Indicate success
        } else {
             console.warn("Points transaction aborted.");
             return false;
        }
    } catch (error) {
        console.error("Error updating points:", error);
        showInfoPopup("Error", "Failed to update points.");
        return false;
    }
}

function openDailySharePopup() {
    const now = Date.now();
    const lastShare = userProfile.lastDailyShare || 0;
    const oneDay = 24 * 60 * 60 * 1000;

    dailyShareStatus.textContent = ''; // Clear previous status
    claimDailyShareButton.disabled = false; // Enable button initially

    if (now - lastShare < oneDay) {
        // Already claimed today
        const nextAvailable = new Date(lastShare + oneDay);
        dailyShareStatus.textContent = `Bonus already claimed today. Next available: ${nextAvailable.toLocaleTimeString()}`;
        claimDailyShareButton.disabled = true;
    } else {
        dailyShareStatus.textContent = `Click claim to get ${DAILY_SHARE_POINTS} points!`;
    }
    openPopup('daily-share-popup');
}

async function handleClaimDailyShare() {
    const now = Date.now();
    const lastShare = userProfile.lastDailyShare || 0;
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - lastShare < oneDay) {
        dailyShareStatus.textContent = "You can only claim the bonus once per day.";
        claimDailyShareButton.disabled = true;
        return;
    }

    claimDailyShareButton.disabled = true;
    dailyShareStatus.textContent = 'Claiming...';

    const pointsUpdated = await updateUserPoints(DAILY_SHARE_POINTS);

    if (pointsUpdated) {
        // Update last claimed time in Firebase
        const userLastShareRef = db.ref(`users/${currentUser.id}/lastDailyShare`);
        try {
            await userLastShareRef.set(now);
            userProfile.lastDailyShare = now; // Update local cache
            dailyShareStatus.textContent = `Success! ${DAILY_SHARE_POINTS} points added.`;
            tg.HapticFeedback.notificationOccurred('success');
            // Optionally close popup after a delay
             setTimeout(() => closePopup('daily-share-popup'), 2000);
        } catch (error) {
            console.error("Failed to update last daily share time:", error);
            // Points were likely still awarded, but log the error
            dailyShareStatus.textContent = 'Points added, but failed to save claim time.';
             // Maybe try to revert points? Complex. For now, just inform.
        }
    } else {
        // updateUserPoints failed (already showed error popup)
        dailyShareStatus.textContent = 'Failed to claim bonus. Please try again.';
        claimDailyShareButton.disabled = false; // Re-enable if failed
         tg.HapticFeedback.notificationOccurred('error');
    }
}

function handleEarnAdsClick() {
    if (adCooldown) {
        showInfoPopup("Cooldown", `Please wait ${AD_COOLDOWN_MS / 1000} seconds between ads.`);
        return;
    }
    if (typeof show_9263144 !== 'function') {
         showInfoPopup("Error", "Ad SDK not loaded correctly.");
         return;
    }


    earnAdsButton.disabled = true;
    earnAdsButton.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`; // Show loading inside button
    showInfoPopup("Loading Ad", "Please wait while the ad loads..."); // Inform user

    console.log("Attempting to show rewarded ad...");

    show_9263144().then(async () => {
        // --- Ad Watched Successfully ---
        console.log("Ad watched successfully.");
        closePopup('info-popup'); // Close the loading ad popup
        showInfoPopup("Success!", `Ad watched! You earned ${AD_REWARD_POINTS} points.`);
        tg.HapticFeedback.notificationOccurred('success');

        const pointsUpdated = await updateUserPoints(AD_REWARD_POINTS);
         if (!pointsUpdated) {
             // Handle points update failure if necessary
             console.error("Failed to update points after ad watch.");
             showInfoPopup("Error", "Ad watched, but failed to update points. Please contact support.");
         }

        // Set cooldown
        adCooldown = true;
        setTimeout(() => {
            adCooldown = false;
            console.log("Ad cooldown finished.");
        }, AD_COOLDOWN_MS);

    }).catch((error) => {
        // --- Ad Failed or Closed Early ---
        console.error("Ad SDK error or ad closed:", error);
         closePopup('info-popup'); // Close the loading ad popup
        showInfoPopup("Ad Not Completed", "Ad was closed or failed to load. No points awarded.");
         tg.HapticFeedback.notificationOccurred('warning');

    }).finally(() => {
        // --- Always re-enable button ---
        earnAdsButton.disabled = false;
         earnAdsButton.innerHTML = `<span class="material-symbols-outlined">paid</span> Earn Points`; // Restore button content
    });
}

// --- Boost Logic ---
 function handleBoostBot(botId) {
     const bot = allBots[botId];
     if (!bot || bot.submitterId !== currentUser.id) {
         showInfoPopup("Error", "Bot not found or you don't own it.");
         return;
     }

     boostBotIdInput.value = botId;
     boostStatus.textContent = ''; // Clear previous status

     // Disable options user can't afford
     boostOptions.forEach(button => {
         const cost = parseInt(button.dataset.cost);
         button.disabled = userProfile.points < cost;
         if (button.disabled) {
             button.title = "Not enough points";
         } else {
              button.title = "";
         }
     });

     openPopup('boost-popup');
 }

 async function handleBoostSelection(event) {
     const button = event.target;
     const botId = boostBotIdInput.value;
     const durationDays = parseInt(button.dataset.duration);
     const cost = parseInt(button.dataset.cost);

     if (!botId || !durationDays || !cost || !allBots[botId]) {
         boostStatus.textContent = 'Error: Invalid boost selection.';
         return;
     }

     if (userProfile.points < cost) {
         boostStatus.textContent = 'Error: Not enough points.';
         return;
     }

     // Disable all options during processing
     boostOptions.forEach(btn => btn.disabled = true);
     boostStatus.textContent = 'Processing boost...';

     // 1. Deduct points
     const pointsDeducted = await updateUserPoints(-cost); // Deduct points

     if (!pointsDeducted) {
         boostStatus.textContent = 'Error: Failed to deduct points. Please try again.';
         boostOptions.forEach(btn => btn.disabled = userProfile.points < parseInt(btn.dataset.cost)); // Re-enable affordable options
         return;
     }

     // 2. Update bot's boost end date in Firebase
     const now = Date.now();
     const currentBoostEnd = allBots[botId].boostEndDate || 0;
     // Extend from now or from the current end date, whichever is later
     const boostStartDate = Math.max(now, currentBoostEnd);
     const newBoostEndDate = boostStartDate + (durationDays * 24 * 60 * 60 * 1000);

     const botBoostRef = db.ref(`bots/${botId}/boostEndDate`);
     try {
         await botBoostRef.set(newBoostEndDate);
         // Update local cache too (important!)
         allBots[botId].boostEndDate = newBoostEndDate;

         boostStatus.textContent = `Success! Bot boosted for ${durationDays} day(s).`;
         tg.HapticFeedback.notificationOccurred('success');
         // Update UI immediately if needed (e.g., add rocket icon) - relies on data listener mostly
         displayBots(); // Re-render lists to show boosted status/sorting
         updateMyBotsList();

         setTimeout(() => closePopup('boost-popup'), 2500);

     } catch (error) {
         console.error("Error setting boost end date:", error);
         boostStatus.textContent = 'Points deducted, but failed to set boost. Contact support.';
         // CRITICAL: Need to handle refunding points here if possible or flag for manual review
         // For simplicity now, we just show the error. A real app needs robust error handling/refund logic.
         tg.HapticFeedback.notificationOccurred('error');
         // Don't re-enable buttons here as state is inconsistent
     }
 }


// --- Start the App ---
initializeApp();
