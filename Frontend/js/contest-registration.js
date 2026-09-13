// ==================== INITIALIZE ====================

let contestData = {};
let contestId = null;
let teamMembers = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Get Contest ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    contestId = urlParams.get('contestId');

    if (!contestId) {
        showError('Contest ID not found in URL');
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

    // Load contest details
    await loadContestDetails();

    // Load user data
    await loadUserData();

    // Setup event listeners
    setupEventListeners();

    // Add one empty team member slot
    addTeamMember();
});

// ==================== LOAD CONTEST DETAILS ====================

async function loadContestDetails() {
    try {
        const response = await fetch(`http://localhost:5000/api/contest-registration/contest/${contestId}`);
        const data = await response.json();

        if (!data.success) {
            showError('Failed to load contest details');
            return;
        }

        contestData = data.contest;

        // Populate contest details
        document.getElementById('contestTitle').textContent = contestData.title;
        document.getElementById('contestDate').textContent = new Date(contestData.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('contestPrize').textContent = contestData.prize || 'TBA';
        document.getElementById('contestTeams').textContent = contestData.registeredTeams || 0;
        document.getElementById('teamSize').textContent = `${contestData.minTeamSize || 1}-${contestData.maxTeamSize || 3}`;
        const fee = contestData.registrationFee || 0;
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
        document.getElementById('minSize').textContent = contestData.minTeamSize || 1;
        document.getElementById('maxSize').textContent = contestData.maxTeamSize || 3;

        console.log('✅ Contest details loaded:', contestData);
    } catch (error) {
        console.error('Error loading contest details:', error);
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
            document.getElementById('leadName').value = user.name || '';
            document.getElementById('leadEmail').value = user.email || '';
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
    document.getElementById('contestRegistrationForm').addEventListener('submit', handleFormSubmit);
}

// ==================== TEAM MEMBER MANAGEMENT ====================

function addTeamMember(event) {
    if (event) {
        event.preventDefault();
    }

    const maxSize = contestData.maxTeamSize || 3;
    if (teamMembers.length >= maxSize) {
        showError(`Maximum team size is ${maxSize}`);
        return;
    }

    const memberId = Date.now();
    const memberIndex = teamMembers.length;
    
    teamMembers.push({
        id: memberId,
        index: memberIndex
    });

    renderTeamMembers();
}

function removeTeamMember(memberId) {
    const minSize = contestData.minTeamSize || 1;
    if (teamMembers.length <= minSize) {
        showError(`Minimum team size is ${minSize}`);
        return;
    }

    teamMembers = teamMembers.filter(m => m.id !== memberId);
    renderTeamMembers();
}

function renderTeamMembers() {
    const container = document.getElementById('teamMembersContainer');
    const countDisplay = document.getElementById('memberCount');

    countDisplay.textContent = teamMembers.length;

    container.innerHTML = teamMembers.map((member, index) => `
        <div class="member-card" id="member-${member.id}">
            <h4>Team Member ${index + 1}</h4>
            <div class="form-row">
                <div class="form-group">
                    <label class="required-field">Full Name</label>
                    <input type="text" class="member-name" data-member-id="${member.id}" placeholder="Member name" required>
                </div>
                <div class="form-group">
                    <label class="required-field">Email</label>
                    <input type="email" class="member-email" data-member-id="${member.id}" placeholder="member@example.com" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Student ID</label>
                    <input type="text" class="member-studentid" data-member-id="${member.id}" placeholder="Student ID">
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="tel" class="member-phone" data-member-id="${member.id}" placeholder="01XXXXXXXXX">
                </div>
            </div>
            <div class="form-row full">
                <div class="form-group">
                    <label>College/Organization</label>
                    <input type="text" class="member-college" data-member-id="${member.id}" placeholder="Your college">
                </div>
            </div>
            ${teamMembers.length > 1 ? `
                <button type="button" class="remove-member-btn" onclick="removeTeamMember(${member.id})">
                    ✕ Remove Member
                </button>
            ` : ''}
        </div>
    `).join('');

    // Update button visibility
    const addBtn = document.getElementById('addMemberBtn');
    const maxSize = contestData.maxTeamSize || 3;
    addBtn.style.display = teamMembers.length >= maxSize ? 'none' : 'block';
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
        paymentAmount.textContent = `৳${contestData.registrationFee || 0}`;
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
        const isFree = !contestData.registrationFee || contestData.registrationFee === 0;
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

        // Collect team members data
        const teamMembersData = teamMembers.map(member => ({
            name: document.querySelector(`.member-name[data-member-id="${member.id}"]`).value,
            email: document.querySelector(`.member-email[data-member-id="${member.id}"]`).value,
            studentId: document.querySelector(`.member-studentid[data-member-id="${member.id}"]`).value || '',
            phone: document.querySelector(`.member-phone[data-member-id="${member.id}"]`).value || '',
            college: document.querySelector(`.member-college[data-member-id="${member.id}"]`).value || ''
        }));

        // Step 2: Submit registration
        const registrationData = {
            contestId: contestId,
            teamName: document.getElementById('teamName').value,
            teamDescription: document.getElementById('teamDescription').value,
            teamMembers: teamMembersData,
            leadName: document.getElementById('leadName').value,
            leadEmail: document.getElementById('leadEmail').value,
            leadPhone: document.getElementById('leadPhone').value,
            leadDepartment: document.getElementById('leadDepartment').value,
            ideaSubmission: document.getElementById('ideaSubmission').value || '',
            technologiesUsed: document.getElementById('technologiesUsed').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t !== ''),
            amount: contestData.registrationFee || 0,
            paymentGateway,
            transactionId
        };

        console.log('🔄 Submitting registration:', registrationData);

        const regResponse = await fetch('http://localhost:5000/api/contest-registration/register', {
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
    const teamName = document.getElementById('teamName').value.trim();
    const leadName = document.getElementById('leadName').value.trim();
    const leadEmail = document.getElementById('leadEmail').value.trim();
    const leadPhone = document.getElementById('leadPhone').value.trim();
    const paymentGateway = document.querySelector('input[name="paymentGateway"]:checked');
    const transactionId = document.getElementById('transactionId').value.trim();
    const minSize = contestData.minTeamSize || 1;
    const maxSize = contestData.maxTeamSize || 3;

    // Check required fields
    if (!teamName) {
        showError('Please enter your team name');
        return false;
    }

    if (!leadName) {
        showError('Please enter the team lead name');
        return false;
    }

    if (!leadEmail) {
        showError('Please enter the team lead email');
        return false;
    }

    if (!isValidEmail(leadEmail)) {
        showError('Please enter a valid email address');
        return false;
    }

    if (!leadPhone) {
        showError('Please enter the team lead phone number');
        return false;
    }

    // Validate team members
    if (teamMembers.length < minSize) {
        showError(`You need at least ${minSize} team member(s)`);
        return false;
    }

    if (teamMembers.length > maxSize) {
        showError(`You can have maximum ${maxSize} team members`);
        return false;
    }

    // Check all team member fields
    for (let member of teamMembers) {
        const name = document.querySelector(`.member-name[data-member-id="${member.id}"]`).value.trim();
        const email = document.querySelector(`.member-email[data-member-id="${member.id}"]`).value.trim();

        if (!name) {
            showError('Please enter all team member names');
            return false;
        }

        if (!email || !isValidEmail(email)) {
            showError('Please enter valid emails for all team members');
            return false;
        }
    }

    const isFree = !contestData.registrationFee || contestData.registrationFee === 0;
    
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

    clearError();
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
    document.getElementById('contestRegistrationForm').style.display = 'none';
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

console.log('✅ Contest registration script loaded!');