const firebaseConfig = {
    apiKey: "AIzaSyBW1WPXUN8DYhT6npZQYoQ3l4J-jFSbzfg", // WARNING: Exposing keys like this is insecure for production
    authDomain: "ab-studio-marketcap.firebaseapp.com",
    databaseURL: "https://ab-studio-marketcap-default-rtdb.firebaseio.com",
    projectId: "ab-studio-marketcap",
    storageBucket: "ab-studio-marketcap.firebasestorage.app",
    messagingSenderId: "115268088088",
    appId: "1:115268088088:web:65643a047f92bfaa66ee6d"
};

// --- Telegram Elements & Data ---
const tg = window.Telegram.WebApp;
let currentUser = null;
let userId = null;
let userFirstName = 'Guest';
let userLastName = '';
let userName = '';
let userPoints = 0;
let userLikes = {}; // Store bots liked by the user { botId: true }

// --- Firebase Refs ---
let db;

// --- DOM Elements ---
const appElement = document.getElementById('app');
const pages = document.querySelectorAll('.page');
const navbar = document.getElementById('navbar');
const navButtons = document.querySelectorAll('.nav-button');
const loadingPage = document.getElementById('loading-page');
const errorPage = document.getElementById('error-page');
const errorMessage = document.getElementById('error-message');
const homePage = document.getElementById('home-page');
const profilePage = document.getElementById('profile-page');
const addBotPage = document.getElementById('add-bot-page'); // Refers to the static page now
const botDetailPage = document.getElementById('bot-detail-page');

const botListContainer = document.getElementById('bot-list-container');
const searchInput = document.getElementById('search-bot');
const tabButtons = document.querySelectorAll('.tab-button');

const profileName = document.getElementById('profile-name');
const profileUsername = document.getElementById('profile-username');
const profileChatId = document.getElementById('profile-chat-id');
const profilePoints = document.getElementById('profile-points');
const earnPointsButton = document.getElementById('earn-points-button');
const shareButton = document.getElementById('share-button'); // Share button

const earnPopup = document.getElementById('earn-popup');
const watchAdButton = document.getElementById('watch-ad-button');
const adStatus = document.getElementById('ad-status');

const addBotPopup = document.getElementById('add-bot-popup');
const addBotForm = document.getElementById('add-bot-form');
const addBotNavButton = document.getElementById('add-bot-nav-button'); // Specific nav button
const popupTitle = document.getElementById('popup-title');
const submitBotButton = document.getElementById('submit-bot-button');
const deleteBotButton = document.getElementById('delete-bot-button'); // Delete button
const editBotIdInput = document.getElementById('edit-bot-id');

const boostPopup = document.getElementById('boost-popup');
const boostBotIdInput = document.getElementById('boost-bot-id');
const boostOptionsContainer = boostPopup.querySelector('.boost-options');
const boostStatus = document.getElementById('boost-status');

const customAlertPopup = document.getElementById('custom-alert-popup');
const customAlertTitle = document.getElementById('custom-alert-title');
const customAlertMessage = document.getElementById('custom-alert-message');

const myAddedBotsListContainer = document.getElementById('my-added-bots-list');

const botDetailContent = document.getElementById('bot-detail-content');
const botDetailName = document.getElementById('detail-bot-name');
const backToHomeButton = document.getElementById('back-to-home-button');
const commentsSection = document.getElementById('bot-comments-section');
const commentsList = document.getElementById('comments-list');
const newCommentText = document.getElementById('new-comment-text');
const submitCommentButton = document.getElementById('submit-comment-button');

// --- App State ---
let currentBotList = []; // Full list of active bots from Firebase
let displayedBots = []; // Filtered/Sorted list currently shown
let currentOpenBotId = null;
let currentOpenBotData = null;
let currentTab = 'all-bots'; // 'all-bots', 'trending-bots', 'my-bots'
const AD_REWARD = 10;
const AD_COOLDOWN_MINUTES = 30; // Cooldown for watching ads
const LIKE_REWARD_FOR_ADDER = 10; // Points adder gets per like

// --- Initialization ---
window.onload = () => {
    initializeApp();
};

function initializeApp() {
    tg.ready(); // Inform Telegram the app is ready
    tg.expand(); // Expand the app to full height

    // Basic platform check
    if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        console.error("Not running inside Telegram or user data unavailable.");
        showPage('error-page');
        errorMessage.textContent = "Error: Cannot retrieve Telegram user data. Please open this app within Telegram.";
        loadingPage.classList.remove('active');
        return;
    }

    // Get User Data
    currentUser = tg.initDataUnsafe.user;
    userId = currentUser.id.toString(); // Ensure string ID
    userFirstName = currentUser.first_name || 'User';
    userLastName = currentUser.last_name || '';
    userName = currentUser.username || 'N/A';

    console.log("Telegram User Data:", currentUser);

    // Initialize Firebase
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        console.log("Firebase Initialized");
    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        showPage('error-page');
        errorMessage.textContent = "Error: Could not connect to the database.";
        loadingPage.classList.remove('active');
        return;
    }

    // Setup Event Listeners
    setupEventListeners();

    // Load initial data
    loadUserProfile(); // Load or create user profile first
    loadBots();       // Then load bots

    // Show Home Page after setup
    showPage('home-page');
    loadingPage.classList.remove('active'); // Hide loading indicator
}

// --- Page Navigation ---
function showPage(pageId) {
    pages.forEach(page => page.classList.remove('active'));
    const activePage = document.getElementById(pageId);
    if (activePage) {
        activePage.classList.add('active');
        // Update navbar active state
        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageId);
        });
         // Reset scroll position when changing pages
        activePage.scrollTop = 0;
    } else {
        console.warn(`Page with id "${pageId}" not found.`);
        // Fallback to home page if requested page doesn't exist
        document.getElementById('home-page').classList.add('active');
        navButtons.forEach(btn => {
             btn.classList.toggle('active', btn.dataset.page === 'home-page');
        });
    }
}

// --- Popup Handling ---
function showPopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.classList.add('active');
    }
}

function hidePopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.classList.remove('active');
         // Reset specific popup states if needed
         if (popupId === 'add-bot-popup') resetAddBotForm();
         if (popupId === 'boost-popup') boostStatus.textContent = '';
         if (popupId === 'earn-popup') adStatus.textContent = '';
    }
}

// --- Custom Alert ---
function showAlert(title = "Alert", message = "") {
    customAlertTitle.textContent = title;
    customAlertMessage.textContent = message;
    showPopup('custom-alert-popup');
}


// --- Event Listeners Setup ---
function setupEventListeners() {
    // Navigation
    navbar.addEventListener('click', (e) => {
        const button = e.target.closest('.nav-button');
        if (button && button.dataset.page) {
            // Special handling for Add Bot button - open popup instead of page
            if (button.id === 'add-bot-nav-button') {
                openAddBotPopup(); // Open the popup for adding
            } else {
                 showPage(button.dataset.page);
                 if (button.dataset.page === 'add-bot-page') {
                    loadMyAddedBots(); // Load user's bots when going to their dedicated page/tab
                 }
            }
        }
    });

     // Back button on Detail Page
    backToHomeButton.addEventListener('click', () => {
        showPage('home-page');
        currentOpenBotId = null; // Clear currently viewed bot
        currentOpenBotData = null;
    });

    // Profile Buttons
    earnPointsButton.addEventListener('click', () => showPopup('earn-popup'));
    shareButton.addEventListener('click', handleShare); // Share button listener

    // Earn Points Popup
    watchAdButton.addEventListener('click', watchAdForPoints);

    // Add Bot Popup / Form
    addBotNavButton.addEventListener('click', openAddBotPopup); // Ensure nav button opens popup
    addBotForm.addEventListener('submit', handleAddOrUpdateBot);
    deleteBotButton.addEventListener('click', handleDeleteBot); // Delete button listener


    // Close Popups
    document.querySelectorAll('.close-popup, .close-popup-button').forEach(btn => {
        btn.addEventListener('click', () => {
            hidePopup(btn.dataset.popup);
        });
    });
     document.querySelectorAll('.popup-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
             if (e.target === overlay) { // Only close if clicking the background overlay itself
                 hidePopup(overlay.id);
             }
         });
     });

    // Search Input
    searchInput.addEventListener('input', debounce(handleSearch, 300));

     // Tab Buttons
     tabButtons.forEach(button => {
         button.addEventListener('click', () => {
             tabButtons.forEach(btn => btn.classList.remove('active'));
             button.classList.add('active');
             currentTab = button.dataset.tab;
             filterAndRenderBots(); // Re-render based on the new tab
             if (currentTab === 'my-bots') {
                 loadMyAddedBots(); // Load specifically when 'My Bots' tab is clicked
             }
         });
     });

    // Boost Popup options
    boostOptionsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.boost-option');
        if (button) {
            const duration = parseInt(button.dataset.duration, 10);
            const cost = parseInt(button.dataset.cost, 10);
            const botId = boostBotIdInput.value;
            if (!botId) {
                boostStatus.textContent = "Error: Bot ID not found.";
                return;
            }
            purchaseBoost(botId, duration, cost);
        }
    });

    // Comment Submission
    submitCommentButton.addEventListener('click', handleSubmitComment);

     // Event delegation for dynamic elements (like buttons)
     document.body.addEventListener('click', handleDynamicClicks);
}

// --- Dynamic Click Handler (for buttons added later like like, edit, boost) ---
function handleDynamicClicks(event) {
    const target = event.target;

    // Like button on bot cards (Home Page)
    if (target.matches('.like-button') || target.closest('.like-button')) {
        const button = target.closest('.like-button');
        const botCard = target.closest('.bot-card');
        if (button && botCard && botCard.dataset.botId) {
             const botId = botCard.dataset.botId;
             toggleLikeBot(botId, button);
         }
        return; // Prevent other handlers if it was a like button
    }

     // Click on a bot card (Home Page) to view details
     const botCard = target.closest('.bot-card');
     if (botCard && botCard.dataset.botId && !target.closest('.like-button')) { // Make sure not clicking the like button itself
         const botId = botCard.dataset.botId;
         viewBotDetails(botId);
         return;
     }

     // Like button on Detail Page
     if (target.matches('.detail-like-button') || target.closest('.detail-like-button')) {
         const button = target.closest('.detail-like-button');
         if (button && currentOpenBotId) {
             toggleLikeBot(currentOpenBotId, button); // Use the currently open bot ID
         }
         return;
     }

    // Boost button on Detail Page
    if (target.matches('.detail-boost-button') || target.closest('.detail-boost-button')) {
         if (currentOpenBotId) {
             openBoostPopup(currentOpenBotId);
         }
         return;
     }

    // Edit button on "My Bots" list (Add Bot Page/Tab)
    if (target.matches('.edit-my-bot') || target.closest('.edit-my-bot')) {
        const button = target.closest('.edit-my-bot');
        const botId = button.dataset.botId;
        if (botId) {
            openEditBotPopup(botId);
        }
        return;
    }

    // Boost button on "My Bots" list (Add Bot Page/Tab)
    if (target.matches('.boost-my-bot') || target.closest('.boost-my-bot')) {
        const button = target.closest('.boost-my-bot');
        const botId = button.dataset.botId;
        if (botId) {
             openBoostPopup(botId); // Open boost popup directly
         }
        return;
    }
}

// --- Firebase Functions ---

// Load or Create User Profile
function loadUserProfile() {
    if (!userId) return;
    const userRef = db.ref(`users/${userId}`);

    // Use onValue for real-time updates on points and liked bots
    userRef.onValue(snapshot => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            userPoints = userData.points || 0;
            userLikes = userData.likes || {}; // Load user's liked bots
            // Update UI immediately
            updateProfileUI(userFirstName, userName, userId, userPoints);
            // Re-render bots if needed to update like button states based on new userLikes data
            if (currentBotList.length > 0) {
                 filterAndRenderBots();
            }
        } else {
            // Create new user profile if it doesn't exist
            console.log("Creating new user profile for:", userId);
            userRef.set({
                firstName: userFirstName,
                lastName: userLastName,
                username: userName,
                chatId: userId,
                points: 0,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                likes: {} // Initialize likes object
            })
            .then(() => {
                console.log("User profile created successfully.");
                userPoints = 0;
                userLikes = {};
                updateProfileUI(userFirstName, userName, userId, userPoints);
            })
            .catch(error => {
                console.error("Error creating user profile:", error);
                showAlert("Database Error", "Could not create your user profile.");
            });
        }
    }, error => {
        console.error("Error reading user profile:", error);
        showAlert("Database Error", "Could not load your profile data.");
        updateProfileUI(userFirstName, userName, userId, 'Error'); // Show error in UI
    });
}


// Load Bots from Firebase
function loadBots() {
    const botsRef = db.ref('bots');

    botsRef.orderByChild('active').equalTo(true).onValue(snapshot => {
        currentBotList = []; // Reset the list
        if (snapshot.exists()) {
            snapshot.forEach(childSnapshot => {
                const botData = childSnapshot.val();
                 // Add bot ID to the data object
                botData.id = childSnapshot.key;
                // Initialize likes if missing
                botData.likeCount = botData.likeCount || 0;
                currentBotList.push(botData);
            });
            console.log("Loaded active bots:", currentBotList.length);
        } else {
            console.log("No active bots found.");
        }
         // Initial sort and render based on the default tab
        filterAndRenderBots();
         // If a bot detail page was open, refresh its data
         if (currentOpenBotId) {
             const updatedBotData = currentBotList.find(bot => bot.id === currentOpenBotId);
             if (updatedBotData) {
                 renderBotDetails(updatedBotData);
             } else {
                 // Bot might have become inactive or deleted
                 showAlert("Bot Info", "The bot you were viewing is no longer available.");
                 showPage('home-page');
                 currentOpenBotId = null;
                 currentOpenBotData = null;
             }
         }

    }, error => {
        console.error("Error loading bots:", error);
        botListContainer.innerHTML = '<p>Error loading bots. Please try again later.</p>';
    });
}

// Load bots added by the current user
function loadMyAddedBots() {
    if (!userId) return;
    const botsRef = db.ref('bots');

    // Query bots added by the current user, including inactive ones for management
    botsRef.orderByChild('adderUserId').equalTo(userId).once('value')
        .then(snapshot => {
            const myBots = [];
            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    const botData = childSnapshot.val();
                    botData.id = childSnapshot.key;
                    myBots.push(botData);
                });
            }
            renderMyAddedBots(myBots); // Render the list specifically for the "My Bots" area
        })
        .catch(error => {
            console.error("Error loading my added bots:", error);
             myAddedBotsListContainer.innerHTML = '<p>Error loading your bots.</p>';
        });
}


// Add or Update Bot in Firebase
function handleAddOrUpdateBot(event) {
    event.preventDefault();
    const botId = editBotIdInput.value; // Get potential ID for editing

    const botData = {
        name: document.getElementById('bot-name').value.trim(),
        description: document.getElementById('bot-description').value.trim(),
        link: document.getElementById('bot-link').value.trim(),
        image: document.getElementById('bot-image').value.trim() || null, // Store null if empty
        airdropName: document.getElementById('airdrop-name').value.trim() || null,
        airdropPoints: document.getElementById('airdrop-points').value ? parseInt(document.getElementById('airdrop-points').value, 10) : null,
        telegramCommunity: document.getElementById('telegram-community').value.trim() || null,
        adderUserId: userId,
        adderUsername: userName,
        adderFirstName: userFirstName,
        // Don't overwrite these on update unless intended
        // likeCount: 0, // Only set on creation
        // createdAt: firebase.database.ServerValue.TIMESTAMP, // Only set on creation
        // active: true // Only set on creation initially
    };

    // Basic Validation
    if (!botData.name || !botData.description || !botData.link) {
        showAlert("Validation Error", "Bot Name, Description, and Link are required.");
        return;
    }
     if (!isValidUrl(botData.link)) {
         showAlert("Validation Error", "Please enter a valid Bot Link (starting with http:// or https:// or t.me/).");
         return;
     }
     if (botData.image && !isValidUrl(botData.image)) {
         showAlert("Validation Error", "Please enter a valid Image Link or leave it empty.");
         return;
     }
      if (botData.telegramCommunity && !isValidUrl(botData.telegramCommunity)) {
         showAlert("Validation Error", "Please enter a valid Telegram Community Link or leave it empty.");
         return;
     }


    submitBotButton.disabled = true;
    submitBotButton.textContent = botId ? 'Updating...' : 'Adding...';

    if (botId) {
        // --- Update existing bot ---
         const updates = {};
         // Only update fields that were provided in the form
         for (const key in botData) {
             if (botData[key] !== undefined && key !== 'adderUserId' && key !== 'adderUsername' && key !== 'adderFirstName') { // Don't update adder info
                 updates[key] = botData[key];
             }
         }
         updates.updatedAt = firebase.database.ServerValue.TIMESTAMP; // Add updated timestamp

        db.ref(`bots/${botId}`).update(updates)
            .then(() => {
                showAlert("Success", "Bot updated successfully!");
                hidePopup('add-bot-popup');
                loadBots(); // Reload bot list
                loadMyAddedBots(); // Reload user's bot list
            })
            .catch(error => {
                console.error("Error updating bot:", error);
                showAlert("Error", "Could not update the bot. Please try again.");
            })
            .finally(() => {
                 resetAddBotForm(); // Reset form even on error
                 submitBotButton.disabled = false; // Re-enable button
             });

    } else {
        // --- Add new bot ---
         // Add creation-specific fields
         botData.likeCount = 0;
         botData.createdAt = firebase.database.ServerValue.TIMESTAMP;
         botData.active = true; // New bots are active by default
         botData.boostedUntil = 0; // Not boosted initially

        const newBotRef = db.ref('bots').push(); // Generate unique ID
        newBotRef.set(botData)
            .then(() => {
                showAlert("Success", "Bot added successfully!");
                hidePopup('add-bot-popup');
                loadBots(); // Reload bot list
                // Switch to home page after adding
                 showPage('home-page');
                 setActiveTab('all-bots'); // Ensure 'All Bots' tab is active
            })
            .catch(error => {
                console.error("Error adding bot:", error);
                showAlert("Error", "Could not add the bot. Please try again.");
            })
            .finally(() => {
                 resetAddBotForm(); // Reset form even on error
                 submitBotButton.disabled = false; // Re-enable button
             });
    }
}

// Delete Bot (Only adder can delete)
function handleDeleteBot() {
    const botId = editBotIdInput.value;
    if (!botId) {
        showAlert("Error", "No bot selected for deletion.");
        return;
    }

    // Confirmation Step (Important!)
     tg.showConfirm(`Are you sure you want to delete the bot "${document.getElementById('bot-name').value}"? This cannot be undone.`, (confirmed) => {
         if (confirmed) {
             deleteBotButton.disabled = true;
             deleteBotButton.textContent = 'Deleting...';

             // You might want to add an 'inactive' flag instead of truly deleting
             // db.ref(`bots/${botId}`).update({ active: false, deletedAt: firebase.database.ServerValue.TIMESTAMP })
             // For actual deletion:
             db.ref(`bots/${botId}`).remove()
                 .then(() => {
                     showAlert("Success", "Bot deleted successfully.");
                     hidePopup('add-bot-popup');
                     loadBots(); // Refresh home list
                     loadMyAddedBots(); // Refresh user's list
                     // Also consider deleting related data like comments or likes if necessary
                     // db.ref(`comments/${botId}`).remove();
                     // db.ref(`likes/${botId}`).remove();
                     // You'd also need to adjust points if likes are removed... deletion can be complex.
                 })
                 .catch(error => {
                     console.error("Error deleting bot:", error);
                     showAlert("Error", "Could not delete the bot.");
                 })
                 .finally(() => {
                     resetAddBotForm();
                 });
         }
     });
}


// Toggle Like/Unlike Bot
function toggleLikeBot(botId, likeButtonElement) {
    if (!userId || !botId) return;

    const botRef = db.ref(`bots/${botId}`);
    const userLikesRef = db.ref(`users/${userId}/likes/${botId}`);
    const liked = userLikes.hasOwnProperty(botId) && userLikes[botId] === true; // Check if user already liked this bot

    // Prevent liking own bot? (Optional rule)
     // const botData = currentBotList.find(b => b.id === botId);
     // if (botData && botData.adderUserId === userId) {
     //     showAlert("Info", "You cannot like your own bot.");
     //     return;
     // }

    // Use a transaction for atomic updates
    botRef.transaction(currentData => {
        if (currentData === null) {
            return null; // Bot doesn't exist
        }
        if (liked) {
            // Unlike
            currentData.likeCount = (currentData.likeCount || 1) - 1; // Decrement, ensure not negative
        } else {
            // Like
            currentData.likeCount = (currentData.likeCount || 0) + 1; // Increment
        }
        return currentData; // Return the modified data
    })
    .then(result => {
        if (!result.committed) {
            console.error("Like transaction failed or aborted for bot:", botId);
            showAlert("Error", "Could not update like status. Please try again.");
            return; // Stop further processing
        }

        // Update user's like status AFTER bot like count is updated
        const newLikeStatus = !liked;
        userLikesRef.set(newLikeStatus ? true : null) // Set to true if liked, null to remove if unliked
            .then(() => {
                console.log(`User ${userId} ${newLikeStatus ? 'liked' : 'unliked'} bot ${botId}`);
                // Update local state immediately for faster UI feedback
                if (newLikeStatus) {
                    userLikes[botId] = true;
                } else {
                    delete userLikes[botId];
                }
                // Visually update the button state (could also rely on data reload, but this is faster)
                if (likeButtonElement) {
                    likeButtonElement.classList.toggle('liked', newLikeStatus);
                     // Update count display if available (e.g., on home page card)
                     const countElement = likeButtonElement.closest('.bot-actions')?.querySelector('.like-count');
                     if (countElement) {
                         const currentCount = parseInt(countElement.textContent || '0', 10);
                         countElement.textContent = newLikeStatus ? currentCount + 1 : Math.max(0, currentCount - 1);
                     }
                     // Update detail page count if visible
                     const detailCountElement = document.getElementById('detail-like-count');
                     if (detailCountElement && currentOpenBotId === botId) {
                          const currentCount = parseInt(detailCountElement.textContent || '0', 10);
                         detailCountElement.textContent = newLikeStatus ? currentCount + 1 : Math.max(0, currentCount - 1);
                     }
                }

                // Award points to the bot adder if liked (and not unliked)
                if (newLikeStatus) {
                    const botData = result.snapshot.val(); // Get the final bot data from transaction
                     if (botData && botData.adderUserId && botData.adderUserId !== userId) { // Check if adder exists and is not the liker
                         awardPoints(botData.adderUserId, LIKE_REWARD_FOR_ADDER, `Liked bot: ${botData.name}`);
                     }
                }
                 // Optional: Deduct points if unliked? (Usually not done)

            })
            .catch(error => {
                 console.error("Error updating user like status:", error);
                 // Attempt to revert the like count? Complex, maybe just log error.
                 showAlert("Error", "Could not save your like preference.");
             });
    })
    .catch(error => {
        console.error("Like transaction error:", error);
        showAlert("Database Error", "An error occurred while liking the bot.");
    });
}

// Award points to a user
function awardPoints(targetUserId, amount, reason = "Points awarded") {
    if (!targetUserId || amount <= 0) return;
    const userPointsRef = db.ref(`users/${targetUserId}/points`);

    userPointsRef.transaction(currentPoints => {
        return (currentPoints || 0) + amount;
    })
    .then(result => {
        if (result.committed) {
            console.log(`Awarded ${amount} points to user ${targetUserId}. Reason: ${reason}. New total: ${result.snapshot.val()}`);
             // Log the transaction (optional but good practice)
             logTransaction(targetUserId, amount, reason);
             // If the current user received points, update their UI immediately
             if (targetUserId === userId) {
                 userPoints = result.snapshot.val(); // Update local state
                 profilePoints.textContent = userPoints;
             }
        } else {
            console.warn(`Point award transaction aborted for user ${targetUserId}.`);
        }
    })
    .catch(error => {
        console.error(`Error awarding points to user ${targetUserId}:`, error);
    });
}


// Deduct points from a user
function deductPoints(targetUserId, amount, reason = "Points deducted") {
    if (!targetUserId || amount <= 0) return Promise.reject("Invalid user or amount"); // Return a rejected promise
    const userPointsRef = db.ref(`users/${targetUserId}/points`);

    return new Promise((resolve, reject) => { // Wrap in promise for better flow control
        userPointsRef.transaction(currentPoints => {
            const current = currentPoints || 0;
            if (current < amount) {
                return; // Abort transaction: Insufficient points
            }
            return current - amount;
        })
        .then(result => {
            if (result.committed) {
                console.log(`Deducted ${amount} points from user ${targetUserId}. Reason: ${reason}. New total: ${result.snapshot.val()}`);
                logTransaction(targetUserId, -amount, reason); // Log as negative amount
                if (targetUserId === userId) {
                     userPoints = result.snapshot.val(); // Update local state
                     profilePoints.textContent = userPoints;
                 }
                resolve(true); // Resolve promise indicating success
            } else {
                 console.warn(`Point deduction transaction aborted for user ${targetUserId} (Likely insufficient points).`);
                 reject("Insufficient points"); // Reject promise
            }
        })
        .catch(error => {
            console.error(`Error deducting points from user ${targetUserId}:`, error);
             reject("Database error during deduction"); // Reject promise
        });
    });
}


// Log Transactions (Optional but recommended)
function logTransaction(targetUserId, amount, reason) {
    const logRef = db.ref(`transactions/${targetUserId}`).push();
    logRef.set({
        amount: amount,
        reason: reason,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        userId: targetUserId // Redundant but useful for querying
    }).catch(error => console.error("Error logging transaction:", error));
}


// --- Ad Integration ---
function watchAdForPoints() {
    if (!userId) return;
     adStatus.textContent = 'Loading ad...';
     watchAdButton.disabled = true;

    // Check cooldown (Optional but recommended)
     const lastAdTimeRef = db.ref(`users/${userId}/lastAdWatched`);
     lastAdTimeRef.once('value').then(snapshot => {
         const lastAdTime = snapshot.val();
         const now = Date.now();
         if (lastAdTime && (now - lastAdTime < AD_COOLDOWN_MINUTES * 60 * 1000)) {
             const minutesRemaining = Math.ceil((AD_COOLDOWN_MINUTES * 60 * 1000 - (now - lastAdTime)) / (60 * 1000));
              adStatus.textContent = `Please wait ${minutesRemaining} min before watching another ad.`;
              showAlert("Cooldown", `Please wait ${minutesRemaining} more minute(s) to earn points.`);
              watchAdButton.disabled = false; // Re-enable button
              // hidePopup('earn-popup'); // Optionally hide popup
              return; // Exit if cooldown active
          }

          // Proceed to show ad if cooldown passed or not set
          console.log("Attempting to show rewarded ad...");
          // Use the provided SDK function 'show_9263144'
          show_9263144()
              .then(() => {
                  console.log("Ad watched successfully!");
                  adStatus.textContent = `Ad finished! Awarding ${AD_REWARD} points...`;
                  // Award points using the transaction function
                  awardPoints(userId, AD_REWARD, "Watched Rewarded Ad");
                   // Update last ad watched time AFTER successful watch and reward attempt
                   lastAdTimeRef.set(firebase.database.ServerValue.TIMESTAMP);
                   // Optionally provide user feedback
                   setTimeout(() => {
                      hidePopup('earn-popup');
                      showAlert("Success!", `You earned ${AD_REWARD} points!`);
                   }, 1500); // Delay slightly to show status message
              })
              .catch((error) => {
                   console.error("Ad SDK Error or Ad Closed Early:", error);
                   adStatus.textContent = 'Ad failed to load or was closed.';
                   showAlert("Ad Error", "Could not load the ad, or it was closed before completion. No points awarded.");
              })
              .finally(() => {
                   watchAdButton.disabled = false; // Re-enable button
              });

     }).catch(error => {
         console.error("Error checking ad cooldown:", error);
         adStatus.textContent = 'Error checking cooldown.';
         watchAdButton.disabled = false; // Re-enable button
          showAlert("Error", "Could not check ad availability. Please try again.");
      });
}

// --- Bot Boosting ---
function openBoostPopup(botId) {
     // Find the bot data to potentially display its name
     const botData = currentBotList.find(b => b.id === botId) || currentOpenBotData; // Check current list or detail view data

     if (!botData) {
         showAlert("Error", "Could not find bot data to boost.");
         return;
     }
     // Check if the current user is the adder
     if (botData.adderUserId !== userId) {
         showAlert("Permission Denied", "You can only boost bots that you have added.");
         return;
     }

    boostBotIdInput.value = botId;
    boostStatus.textContent = ''; // Clear previous status
     // You could add the bot name to the popup title here if desired
     // boostPopup.querySelector('h2').textContent = `Boost Bot: ${botData.name}`;
    showPopup('boost-popup');
}

function purchaseBoost(botId, durationDays, cost) {
    if (!userId || !botId || !durationDays || !cost) return;

    boostStatus.textContent = `Processing boost for ${durationDays} day(s)...`;
    boostOptionsContainer.style.pointerEvents = 'none'; // Disable buttons during processing

    // 1. Deduct points first
    deductPoints(userId, cost, `Boost bot ${botId} for ${durationDays} day(s)`)
        .then(() => {
            // 2. If points deducted successfully, update the bot's boostedUntil timestamp
            const now = Date.now();
            const boostEndTime = now + durationDays * 24 * 60 * 60 * 1000; // Calculate end time in milliseconds
            const botRef = db.ref(`bots/${botId}`);

            // Check current boostedUntil time to extend, not just overwrite
             botRef.child('boostedUntil').once('value').then(snapshot => {
                 const currentBoostEnd = snapshot.val() || 0;
                 const startTime = Math.max(now, currentBoostEnd); // Start boost from now or end of current boost, whichever is later
                 const finalBoostEndTime = startTime + durationDays * 24 * 60 * 60 * 1000;

                 botRef.update({ boostedUntil: finalBoostEndTime })
                     .then(() => {
                         boostStatus.textContent = `Success! Bot boosted until ${new Date(finalBoostEndTime).toLocaleString()}.`;
                         console.log(`Bot ${botId} boosted until ${finalBoostEndTime}`);
                         loadBots(); // Reload bots to reflect boost status in sorting/display
                         setTimeout(() => {
                            hidePopup('boost-popup');
                         }, 2500);
                     })
                     .catch(error => {
                         console.error("Error updating bot boost time:", error);
                         boostStatus.textContent = 'Error applying boost. Points deducted but boost failed. Contact support.';
                          // !!! Critical: Need a way to potentially refund points here or flag for manual review
                          logTransaction(userId, cost, `REFUND FAILED BOOST: Bot ${botId}`); // Log refund attempt/failure
                          showAlert("Critical Error", "Failed to apply boost after points were deducted. Please contact support.");
                      });
             }).catch(error => {
                 console.error("Error reading current boost time:", error);
                 boostStatus.textContent = 'Error checking current boost status.';
                 // Refund points as the check failed before updating
                 awardPoints(userId, cost, `REFUND: Failed to check boost status for bot ${botId}`);
             });
        })
        .catch(errorMsg => {
            // Point deduction failed (likely insufficient points)
            boostStatus.textContent = `Boost failed: ${errorMsg}.`;
            console.warn(`Boost purchase failed for bot ${botId}: ${errorMsg}`);
        })
        .finally(() => {
            boostOptionsContainer.style.pointerEvents = 'auto'; // Re-enable buttons
        });
}

// --- Comments ---
function loadComments(botId) {
    const commentsRef = db.ref(`comments/${botId}`).orderByChild('timestamp').limitToLast(50); // Load last 50 comments
    commentsList.innerHTML = '<p>Loading comments...</p>'; // Show loading indicator

    commentsRef.on('value', snapshot => {
        commentsList.innerHTML = ''; // Clear previous comments
        if (snapshot.exists()) {
            snapshot.forEach(commentSnapshot => {
                const commentData = commentSnapshot.val();
                renderComment(commentData);
            });
        } else {
            commentsList.innerHTML = '<p>No comments yet. Be the first!</p>';
        }
         // Scroll to bottom of comments maybe? Optional.
         // commentsList.scrollTop = commentsList.scrollHeight;
    }, error => {
        console.error("Error loading comments:", error);
        commentsList.innerHTML = '<p>Error loading comments.</p>';
    });

    // Store the bot ID for submitting new comments
    submitCommentButton.dataset.botId = botId;
}

function renderComment(commentData) {
    if (!commentData) return;
    const commentDiv = document.createElement('div');
    commentDiv.classList.add('comment');

    const meta = document.createElement('div');
    meta.classList.add('comment-meta');
    meta.innerHTML = `<strong>${commentData.username || commentData.firstName || 'User'}</strong> <span class="timestamp">(${new Date(commentData.timestamp).toLocaleString()})</span>`;

    const text = document.createElement('p');
    text.classList.add('comment-text');
    // Sanitize comment text before displaying to prevent XSS
    text.textContent = commentData.text; // Basic text content rendering is safer

    commentDiv.appendChild(meta);
    commentDiv.appendChild(text);

    // Prepend new comments to show latest first? Or append for chronological order. Append = default.
    commentsList.appendChild(commentDiv);
    // If prepending: commentsList.insertBefore(commentDiv, commentsList.firstChild);
}

function handleSubmitComment() {
     const botId = submitCommentButton.dataset.botId; // Get bot ID from button's data attribute
     const commentText = newCommentText.value.trim();

     if (!botId) {
         showAlert("Error", "Cannot submit comment: Bot ID is missing.");
         return;
     }
     if (!commentText) {
         showAlert("Error", "Comment cannot be empty.");
         return;
     }
     if (!userId) {
         showAlert("Error", "You must be logged in to comment.");
         return;
     }

     submitCommentButton.disabled = true;
     submitCommentButton.textContent = 'Posting...';

     const commentData = {
         userId: userId,
         username: userName,
         firstName: userFirstName,
         text: commentText,
         timestamp: firebase.database.ServerValue.TIMESTAMP,
         botId: botId // Store botId with comment for potential future queries
     };

     const newCommentRef = db.ref(`comments/${botId}`).push();
     newCommentRef.set(commentData)
         .then(() => {
             console.log("Comment posted successfully for bot:", botId);
             newCommentText.value = ''; // Clear textarea
             // The 'onValue' listener for comments should automatically update the list
         })
         .catch(error => {
             console.error("Error posting comment:", error);
             showAlert("Error", "Could not post your comment. Please try again.");
         })
         .finally(() => {
             submitCommentButton.disabled = false;
             submitCommentButton.textContent = 'Submit Comment';
         });
}


// --- Rendering Functions ---

// Update Profile UI
function updateProfileUI(name, username, id, points) {
    profileName.textContent = `${name} ${userLastName}`.trim();
    profileUsername.textContent = username || 'Not Set';
    profileChatId.textContent = id;
    profilePoints.textContent = points;
}

// Filter, Sort, and Render Bots based on current tab and search
function filterAndRenderBots() {
     let filtered = [...currentBotList]; // Create a copy to avoid modifying the original list

     // 1. Filter by Search Term (if any)
     const searchTerm = searchInput.value.trim().toLowerCase();
     if (searchTerm) {
         filtered = filtered.filter(bot =>
             (bot.name && bot.name.toLowerCase().includes(searchTerm)) ||
             (bot.description && bot.description.toLowerCase().includes(searchTerm))
         );
     }

     // 2. Filter by Tab ('my-bots' requires separate loading, handled elsewhere)
     if (currentTab === 'trending-bots') {
          // Trending logic: Boosted first, then by likes.
          // Boosted bots are considered trending.
          filtered = filtered.filter(bot => isBoosted(bot)); // Show only boosted bots for now
     }
     // 'all-bots' tab shows all (already filtered by search if needed)
     // 'my-bots' tab content is handled by renderMyAddedBots

     // 3. Sort
     if (currentTab === 'trending-bots') {
         // Sort boosted bots potentially by remaining boost time or just likes within boosted
          filtered.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)); // Simple like sort for boosted
     } else if (currentTab === 'all-bots') {
          // Default sort for "All Bots": Boosted first, then by likes descending
          filtered.sort((a, b) => {
              const aBoosted = isBoosted(a);
              const bBoosted = isBoosted(b);
              if (aBoosted && !bBoosted) return -1; // a comes first
              if (!aBoosted && bBoosted) return 1;  // b comes first
              // If both boosted or both not boosted, sort by likes
              return (b.likeCount || 0) - (a.likeCount || 0);
          });
     }
     // No specific sorting needed for 'my-bots' here, handled in its own render function


    // 4. Render the final list for the current active tab's container
    // Only render if the home page is active and not the 'my-bots' tab (which uses a different container)
     if (document.getElementById('home-page').classList.contains('active') && currentTab !== 'my-bots') {
         renderBotList(filtered, botListContainer);
         displayedBots = filtered; // Store the currently displayed list
     }
}

// Render the Bot List on Home Page
function renderBotList(botsToRender, container) {
    container.innerHTML = ''; // Clear previous list

    if (botsToRender.length === 0) {
        let message = "No bots found.";
        if (searchInput.value.trim()) {
             message = "No bots match your search.";
         } else if (currentTab === 'trending-bots') {
             message = "No trending bots right now. Boost yours to appear here!";
         } else if (currentTab === 'my-bots') {
             message = "You haven't added any bots yet."; // Message specific to my bots tab
         }
        container.innerHTML = `<p>${message}</p>`;
        return;
    }

    botsToRender.forEach(bot => {
        const card = document.createElement('div');
        card.classList.add('bot-card');
        card.dataset.botId = bot.id; // Store bot ID for easy access

        const icon = document.createElement('img');
        icon.classList.add('bot-icon');
        icon.src = bot.image || 'icons/default_bot.png'; // Use default if no image
        icon.alt = bot.name;
        icon.onerror = () => { icon.src = 'icons/default_bot.png'; }; // Fallback on error

        const info = document.createElement('div');
        info.classList.add('bot-info');
        const name = document.createElement('h3');
        name.textContent = bot.name;
        const desc = document.createElement('p');
        desc.textContent = bot.description;
        // Add boosted indicator if applicable
         if (isBoosted(bot)) {
             const boostedIndicator = document.createElement('span');
             boostedIndicator.textContent = '🚀 Boosted';
             boostedIndicator.style.fontSize = '0.8em';
             boostedIndicator.style.color = '#17a2b8'; // Info color
             boostedIndicator.style.marginLeft = '5px';
             name.appendChild(boostedIndicator);
         }

        info.appendChild(name);
        info.appendChild(desc);

        const actions = document.createElement('div');
        actions.classList.add('bot-actions');
        const likeButton = document.createElement('button');
        likeButton.classList.add('like-button');
        likeButton.innerHTML = '❤️'; // Using emoji heart
         // Check if the current user has liked this bot
         if (userLikes && userLikes[bot.id]) {
             likeButton.classList.add('liked');
         }
        const likeCount = document.createElement('span');
        likeCount.classList.add('like-count');
        likeCount.textContent = bot.likeCount || 0;

        actions.appendChild(likeButton);
        actions.appendChild(likeCount);

        card.appendChild(icon);
        card.appendChild(info);
        card.appendChild(actions);

        container.appendChild(card);
    });
}

// Render the list of bots added by the user (for the "My Bots" tab/page)
function renderMyAddedBots(myBots) {
     myAddedBotsListContainer.innerHTML = ''; // Clear previous
     if (myBots.length === 0) {
         myAddedBotsListContainer.innerHTML = '<p>You haven\'t added any bots yet. Use the \'+\' button to add one!</p>';
         return;
     }

     // Sort my bots maybe by creation date or name?
     myBots.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Sort newest first

     myBots.forEach(bot => {
         const item = document.createElement('div');
         item.classList.add('my-bot-item');

         const nameSpan = document.createElement('span');
         nameSpan.textContent = bot.name;
         if (!bot.active) {
             nameSpan.textContent += ' (Inactive)';
             nameSpan.style.opacity = '0.6';
         }

         const actionsDiv = document.createElement('div');
         actionsDiv.classList.add('my-bot-actions');

         const editButton = document.createElement('button');
         editButton.textContent = 'Edit';
         editButton.classList.add('edit-my-bot');
         editButton.dataset.botId = bot.id;

         const boostButton = document.createElement('button');
         boostButton.textContent = 'Boost';
         boostButton.classList.add('boost-my-bot');
         boostButton.dataset.botId = bot.id;
         if (isBoosted(bot)) {
             boostButton.textContent = 'Boosted';
             boostButton.disabled = true; // Or show remaining time
             boostButton.style.opacity = '0.7';
         }

         actionsDiv.appendChild(editButton);
         actionsDiv.appendChild(boostButton);

         item.appendChild(nameSpan);
         item.appendChild(actionsDiv);
         myAddedBotsListContainer.appendChild(item);
     });
}


// View Bot Details
function viewBotDetails(botId) {
    currentOpenBotId = botId; // Store the ID of the bot being viewed
     currentOpenBotData = currentBotList.find(bot => bot.id === botId); // Find from the current list

    if (!currentOpenBotData) {
        // Maybe bot became inactive or was deleted while user was browsing
        // Attempt to fetch directly from Firebase once as a fallback
        db.ref(`bots/${botId}`).once('value').then(snapshot => {
            if (snapshot.exists()) {
                 currentOpenBotData = snapshot.val();
                 currentOpenBotData.id = botId; // Add ID back
                 renderBotDetails(currentOpenBotData);
                 loadComments(botId); // Load comments for this bot
                 showPage('bot-detail-page');
            } else {
                showAlert("Not Found", "The selected bot could not be found or is no longer available.");
                 currentOpenBotId = null; // Reset
                 currentOpenBotData = null;
                 showPage('home-page'); // Go back home
             }
        }).catch(error => {
             console.error("Error fetching bot details fallback:", error);
             showAlert("Error", "Could not load bot details.");
             currentOpenBotId = null;
             currentOpenBotData = null;
             showPage('home-page');
         });
        return;
    }

    // Render if data found in the current list
    renderBotDetails(currentOpenBotData);
    loadComments(botId); // Load comments for this bot
    showPage('bot-detail-page');
}

// Render Bot Details Page Content
function renderBotDetails(botData) {
     if (!botData) {
         botDetailContent.innerHTML = "<p>Error: Bot data not available.</p>";
         commentsSection.style.display = 'none'; // Hide comments if no bot data
         return;
     }

     botDetailName.textContent = botData.name; // Update header title

     let airdropInfo = 'N/A';
     if (botData.airdropName) {
         airdropInfo = `${botData.airdropName}`;
         if (botData.airdropPoints) {
             airdropInfo += ` (${botData.airdropPoints} Points)`;
         }
     }

     const isLiked = userLikes && userLikes[botData.id];
     const canBoost = botData.adderUserId === userId; // Can user boost this bot?

     botDetailContent.innerHTML = `
        <img src="${botData.image || 'icons/default_bot.png'}" alt="${botData.name}" class="detail-bot-icon" onerror="this.src='icons/default_bot.png';">
        <h2>${botData.name}</h2>
        <p><strong>Description:</strong> ${botData.description}</p>
        <p><strong>Bot Link:</strong> <a href="${botData.link}" target="_blank" rel="noopener noreferrer">${botData.link}</a></p>
        ${botData.telegramCommunity ? `<p><strong>Community:</strong> <a href="${botData.telegramCommunity}" target="_blank" rel="noopener noreferrer">${botData.telegramCommunity}</a></p>` : ''}
        <p><strong>Airdrop Info:</strong> ${airdropInfo}</p>
        <p><strong>Added By:</strong> ${botData.adderFirstName || botData.adderUsername || 'Unknown'}</p>
        <p><strong>Likes:</strong> <span id="detail-like-count">${botData.likeCount || 0}</span></p>
         ${isBoosted(botData) ? `<p><strong>Status:</strong> 🚀 Boosted until ${new Date(botData.boostedUntil).toLocaleDateString()}</p>` : ''}

        <div class="detail-action-buttons">
            <button class="detail-like-button ${isLiked ? 'liked' : ''}" data-bot-id="${botData.id}">
                ${isLiked ? '❤️ Liked' : '🤍 Like'}
            </button>
            ${canBoost ? `<button class="detail-boost-button" data-bot-id="${botData.id}">⚡ Boost Bot</button>` : ''}
            <!-- Add Share button maybe? -->
        </div>
    `;

    // Ensure comments section is visible
     commentsSection.style.display = 'block';
     newCommentText.value = ''; // Clear comment input
}

// --- Add/Edit Bot Popup Handling ---
function openAddBotPopup() {
     resetAddBotForm();
     popupTitle.textContent = "Add New Bot";
     submitBotButton.textContent = "Add Bot";
     deleteBotButton.style.display = 'none'; // Hide delete button for new bots
     showPopup('add-bot-popup');
}

function openEditBotPopup(botId) {
     resetAddBotForm(); // Clear previous data first
     popupTitle.textContent = "Edit Bot";
     submitBotButton.textContent = "Update Bot";
     deleteBotButton.style.display = 'inline-block'; // Show delete button
     editBotIdInput.value = botId; // Set the ID for the update

     // Fetch the bot data to pre-fill the form
     db.ref(`bots/${botId}`).once('value')
         .then(snapshot => {
             if (snapshot.exists()) {
                 const botData = snapshot.val();
                  // Security check: Ensure current user is the adder
                  if (botData.adderUserId !== userId) {
                      showAlert("Permission Denied", "You can only edit bots you added.");
                      resetAddBotForm(); // Clear potentially filled data
                      return;
                  }
                 // Fill the form
                 document.getElementById('bot-name').value = botData.name || '';
                 document.getElementById('bot-description').value = botData.description || '';
                 document.getElementById('bot-link').value = botData.link || '';
                 document.getElementById('bot-image').value = botData.image || '';
                 document.getElementById('airdrop-name').value = botData.airdropName || '';
                 document.getElementById('airdrop-points').value = botData.airdropPoints || '';
                 document.getElementById('telegram-community').value = botData.telegramCommunity || '';

                 showPopup('add-bot-popup'); // Show popup after filling
             } else {
                 showAlert("Error", "Could not find the bot data to edit.");
             }
         })
         .catch(error => {
             console.error("Error fetching bot data for edit:", error);
             showAlert("Error", "Could not load bot data for editing.");
         });
}


function resetAddBotForm() {
     addBotForm.reset(); // Resets all form fields
     editBotIdInput.value = ''; // Clear hidden ID field
     popupTitle.textContent = "Add New Bot";
     submitBotButton.textContent = "Add Bot";
     submitBotButton.disabled = false; // Ensure button is enabled
     deleteBotButton.style.display = 'none'; // Hide delete button
     deleteBotButton.disabled = false; // Ensure delete button is enabled
     deleteBotButton.textContent = 'Delete Bot';
}

// --- Search Handling ---
function handleSearch() {
    filterAndRenderBots(); // Re-filter and render the list on search input
}

// --- Share Functionality ---
function handleShare() {
     if (!userId) return;
     // Basic Share: Create a referral link (can be enhanced)
     // This is a simple example link, replace with your actual app URL if hosted
     const appUrl = `https://t.me/${tg.WebApp?.botInfo?.username || 'YourBotUsername'}/${tg.WebApp?.pathFull || 'YourMiniAppName'}`; // Attempt to get bot/app name
     const referralLink = `${appUrl}?start=${userId}`; // Add user ID as referral param
     const shareText = `Check out this awesome Bot Market on Telegram! Find cool bots or add your own: ${referralLink}`;

     // Use Telegram's share functionality if available and applicable
     // This might share directly to a chat. Check Telegram SDK docs for specific methods.
     // Example using a generic approach:
     try {
         // Attempt to use Telegram's share URL scheme
         tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`);

         // Optional: Give points for initiating share (could be abused)
         // awardPoints(userId, 5, "Shared the app");
         // showAlert("Sharing", "Opened Telegram share window. Thank you!");

     } catch (e) {
         console.error("Share error:", e);
         // Fallback: Show the link for manual copying
         showAlert("Share Link", `Copy and share this link:\n${referralLink}\n\n${shareText}`);
     }
}


// --- Utility Functions ---

// Debounce function to limit rapid calls (e.g., for search)
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

// Simple URL Validation
function isValidUrl(string) {
    // Basic check for http/https/t.me start and some characters
    const pattern = /^(https?:\/\/|t\.me\/)[\-A-Za-z0-9+&@#\/%?=~_|!:,.;]*[\-A-Za-z0-9+&@#\/%=~_|]$/;
    return !!pattern.test(string);
}

// Check if a bot is currently boosted
function isBoosted(bot) {
    return bot && bot.boostedUntil && bot.boostedUntil > Date.now();
}

// Set active tab visually and update state
function setActiveTab(tabDataName) {
     tabButtons.forEach(button => {
         const isActive = button.dataset.tab === tabDataName;
         button.classList.toggle('active', isActive);
         if (isActive) {
             currentTab = tabDataName;
         }
     });
}

// --- END ---