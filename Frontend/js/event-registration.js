// ==================== INITIALIZE ====================

let eventData = {};
let eventId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Get Event ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    eventId = urlParams.get('eventId');

    if (!eventId) {
        showError('Event ID not found in URL');
        return;
    }

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        showError('Please log in first');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return;
    }

    // Load event details
    await loadEventDetails();

    // Load user data
    await loadUserData();

    // Setup event listeners
    setupEventListeners();
});

// ==================== LOAD EVENT DETAILS ====================

async function loadEventDetails() {
    try {
        const response = await fetch(`http://localhost:5000/api/event-registration/event/${eventId}`);
        const data = await response.json();

        if (!data.success) {
            showError('Failed to load event details');
            return;
        }

        eventData = data.event;

        // Populate event details
        document.getElementById('eventTitle').textContent = eventData.title;
        document.getElementById('eventDate').textContent = new Date(eventData.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('eventLocation').textContent = eventData.location;
        document.getElementById('eventRegistered').textContent = eventData.registeredCount || 0;
        
        const fee = eventData.registrationFee || 0;
        if (fee === 0) {
            document.getElementById('totalAmount').textContent = 'Free';
            document.getElementById('paymentSection').style.display = 'none';
            const importantNotes = document.getElementById('importantNotes');
            if (importantNotes) importantNotes.style.display = 'none';
            document.getElementById('freeNotice').style.display = 'block';
        } else {
            document.getElementById('totalAmount').textContent = `৳ ${fee}`;
            document.getElementById('paymentSection').style.display = 'block';
            document.getElementById('freeNotice').style.display = 'none';
            const feeDisplayPaid = document.getElementById('feeDisplayPaid');
            if (feeDisplayPaid) feeDisplayPaid.textContent = `${fee} Taka`;
        }

        // Show/hide preferences
        if (eventData.requiresTshirt) {
            document.getElementById('tshirtRow').style.display = 'grid';
            document.getElementById('tshirtIncluded').style.display = 'list-item';
        }
        if (eventData.includeMeals) {
            document.getElementById('dietaryRow').style.display = 'grid';
            document.getElementById('mealsIncluded').style.display = 'list-item';
        }

        console.log('✅ Event details loaded:', eventData);
    } catch (error) {
        console.error('Error loading event details:', error);
        showError('Server error');
    }
}

// ==================== LOAD USER DATA ====================

async function loadUserData() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5000/api/auth/profile', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            const user = data.user;
            document.getElementById('fullName').value = user.name || '';
            document.getElementById('email').value = user.email || '';
            document.getElementById('studentId').value = user.studentId || '';
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// ==================== SETUP EVENT LISTENERS ====================

function setupEventListeners() {
    // Payment gateway selection
    document.querySelectorAll('input[name="paymentGateway"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            showPaymentInfo(e.target.value);
        });
    });

    // Form submission
    document.getElementById('eventRegistrationForm').addEventListener('submit', handleFormSubmit);
}

// ==================== SHOW PAYMENT INFORMATION ====================

function showPaymentInfo(gateway) {
    const paymentInfo = document.getElementById('paymentInfo');
    const gatewayName = document.getElementById('gatewayName');
    const gatewayNumber = document.getElementById('gatewayNumber');
    const paymentAmount = document.getElementById('paymentAmount');

    const gatewayDetails = {
        'bKash': {
            number: '01771234567', // Replace with your actual bKash number
            instructions: 'Send Money to this account'
        },
        'Nagad': {
            number: '01771234567', // Replace with your actual Nagad number
            instructions: 'Send Money to this account'
        },
        'Rocket': {
            number: '01771234567' // Replace with your actual Rocket number
        }
    };

    if (gatewayDetails[gateway]) {
        gatewayName.textContent = `💳 ${gateway} Payment`;
        gatewayNumber.textContent = gatewayDetails[gateway].number;
        paymentAmount.textContent = `৳${eventData.registrationFee || 0}`;
        paymentInfo.style.display = 'block';
    }
}

// ==================== HANDLE FORM SUBMISSION ====================

async function handleFormSubmit(e) {
    e.preventDefault();

    const token = localStorage.getItem('token');

    // Validate form
    if (!validateForm()) {
        return;
    }

    showLoading(true);

    try {
        const isFree = !eventData.registrationFee || eventData.registrationFee === 0;
        let paymentGateway = 'none';
        let transactionId = '';

        if (!isFree) {
            // Step 1: Verify transaction
            paymentGateway = document.querySelector('input[name="paymentGateway"]:checked').value;
            transactionId = document.getElementById('transactionId').value.trim();

            console.log('Verifying transaction:', { paymentGateway, transactionId });

            const verifyResponse = await fetch('http://localhost:5000/api/event-registration/verify-transaction', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    transactionId,
                    paymentGateway
                })
            });

            const verifyData = await verifyResponse.json();

            if (!verifyData.success) {
                showError('Transaction verification failed: ' + verifyData.message);
                showLoading(false);
                return;
            }

            console.log('Transaction verified');
        }

        // Step 2: Submit registration
        const registrationData = {
            eventId: eventId,
            fullName: document.getElementById('fullName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            studentId: document.getElementById('studentId').value,
            department: document.getElementById('department').value,
            semester: document.getElementById('semester').value,
            dietaryPreference: document.getElementById('dietaryPreference').value || 'No Preference',
            tshirtSize: document.getElementById('tshirtSize').value || 'M',
            specialRequirements: document.getElementById('specialRequirements').value,
            amount: eventData.registrationFee || 0,
            paymentGateway,
            transactionId
        };

        console.log('🔄 Submitting registration:', registrationData);

        const regResponse = await fetch('http://localhost:5000/api/event-registration/register', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(registrationData)
        });

        const regData = await regResponse.json();

        if (!regData.success) {
            showError('❌ Registration failed: ' + regData.message);
            showLoading(false);
            return;
        }

        console.log('✅ Registration successful');

        // Show success message
        showSuccess();

        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'member_dashboard.html';
        }, 2000);

    } catch (error) {
        console.error('Error:', error);
        showError('❌ An error occurred: ' + error.message);
        showLoading(false);
    }
}

// ==================== VALIDATION ====================

function validateForm() {
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const paymentGateway = document.querySelector('input[name="paymentGateway"]:checked');
    const transactionId = document.getElementById('transactionId').value.trim();

    // Check required fields
    if (!fullName) {
        showError('Please enter your full name');
        return false;
    }

    if (!email) {
        showError('Please enter your email');
        return false;
    }

    if (!isValidEmail(email)) {
        showError('Please enter a valid email address');
        return false;
    }

    if (!phone) {
        showError('Please enter your phone number');
        return false;
    }

    const isFree = !eventData.registrationFee || eventData.registrationFee === 0;
    
    if (!isFree) {
        if (!paymentGateway) {
            showError('Please select a payment gateway');
            return false;
        }

        if (!transactionId) {
            showError('Please enter your transaction ID');
            return false;
        }
    }

    return true;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==================== UI HELPERS ====================

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.innerHTML = message;
    errorDiv.classList.add('show');
    window.scrollTo(0, 0);
}

function clearError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.classList.remove('show');
}

function showSuccess() {
    document.getElementById('successMessage').classList.add('show');
    document.getElementById('eventRegistrationForm').style.display = 'none';
}

function showLoading(show) {
    const loadingState = document.getElementById('loadingState');
    const submitBtn = document.getElementById('submitBtn');

    if (show) {
        loadingState.classList.add('show');
        submitBtn.disabled = true;
        clearError();
    } else {
        loadingState.classList.remove('show');
        submitBtn.disabled = false;
    }
}

console.log('✅ Event registration script loaded!');