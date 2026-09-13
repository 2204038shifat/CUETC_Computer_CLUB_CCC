// ==================== SPENDING LOGIC ====================
let eventSpent = 0;
let contestSpent = 0;

function updateTotalSpentDisplay() {
    const totalDisplay = document.getElementById('totalSpent');
    if (totalDisplay) {
        totalDisplay.innerText = '৳ ' + (eventSpent + contestSpent);
    }
}

// ==================== INITIALIZE ====================

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const userName = localStorage.getItem('userName');
    
    // 1. Set Welcome Name immediately from local storage
    if (userName) {
        document.getElementById('welcomeName').innerText = userName.split(' ')[0];
    }

    // 2. Handle Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.clear();
        window.location.href = 'login.html';
    });

    // 3. Fetch Profile Data from Backend
    if (token) {
        loadProfile();
        loadEventRegistrations();
        loadContestRegistrations();
    } else {
        window.location.href = 'login.html';
    }
});

// ==================== LOAD USER PROFILE ====================

async function loadProfile() {
    const token = localStorage.getItem('token');

    if (!token) {
        console.error('❌ No token found');
        window.location.href = 'login.html';
        return;
    }

    try {
        const res = await fetch('http://localhost:5000/api/auth/profile', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await res.json();

        if (res.ok && data.success) {
            const userData = data.user;
            
            // Update profile information
            document.getElementById('profileName').innerText = userData.name || 'N/A';
            document.getElementById('profileEmail').innerText = userData.email || 'N/A';
            document.getElementById('profileId').innerText = userData.studentId || 'N/A';
            
            // Format date
            const createdDate = new Date(userData.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            document.getElementById('profileDate').innerText = createdDate;

            console.log('✅ Profile loaded:', userData);
        } else {
            console.error('❌ Failed to load profile:', data.message);
        }
    } catch (error) {
        console.error('❌ Error loading profile:', error);
    }
}

// ==================== LOAD EVENT REGISTRATIONS ====================

async function loadEventRegistrations() {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('http://localhost:5000/api/event-registration/my-registrations', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            console.error('❌ Failed to load event registrations');
            return;
        }

        let registrations = data.registrations || [];
        // Filter out orphaned registrations where the event was deleted
        registrations = registrations.filter(reg => reg.eventId);

        eventSpent = registrations.reduce((sum, reg) => {
            if (reg.paymentStatus === 'confirmed' && reg.registrationStatus === 'confirmed') {
                return sum + (reg.amount || 0);
            }
            return sum;
        }, 0);
        updateTotalSpentDisplay();
        
        const container = document.getElementById('myEventsList');
        const countDisplay = document.getElementById('eventCount');

        countDisplay.innerText = registrations.length;

        if (registrations.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <p>📭 No event registrations yet</p>
                    <p style="font-size: 0.9rem;">
                        <a href="index.html#events" style="color: var(--primary-color);">Browse events →</a>
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = registrations.map(reg => `
            <div class="registration-item">
                <h4>📅 ${reg.eventId.title}</h4>
                <div class="registration-detail">
                    <strong>Date:</strong> ${new Date(reg.eventId.date).toLocaleDateString()}
                </div>
                <div class="registration-detail">
                    <strong>Location:</strong> ${reg.eventId.location || 'TBA'}
                </div>
                <div class="registration-detail">
                    <strong>Amount Paid:</strong> ৳${reg.amount || 0}
                </div>
                <div class="registration-detail">
                    <strong>Status:</strong> 
                    <span class="status-badge ${reg.registrationStatus || 'pending'}">
                        ${(reg.registrationStatus || 'pending').toUpperCase()}
                    </span>
                </div>
                <div class="registration-detail">
                    <strong>Payment:</strong> ${(reg.paymentStatus || 'pending').toUpperCase()}
                </div>
                <div class="registration-detail">
                    <strong>Gateway:</strong> ${reg.paymentGateway}
                </div>
                <div class="registration-detail" style="word-break: break-all;">
                    <strong>Transaction ID:</strong> <code style="background: rgba(99, 102, 241, 0.1); padding: 4px; border-radius: 4px;">${reg.transactionId}</code>
                </div>
                ${reg.registrationStatus !== 'cancelled' ? `
                    <button class="cancel-btn" onclick="cancelEventRegistration('${reg._id}')">
                        ✕ Cancel Registration
                    </button>
                ` : ''}
            </div>
        `).join('');

        console.log('✅ Event registrations loaded:', registrations);

    } catch (error) {
        console.error('❌ Error loading event registrations:', error);
    }
}

// ==================== LOAD CONTEST REGISTRATIONS ====================

async function loadContestRegistrations() {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('http://localhost:5000/api/contest-registration/my-registrations', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            console.error('❌ Failed to load contest registrations');
            return;
        }

        let registrations = data.registrations || [];
        // Filter out orphaned registrations where the contest was deleted
        registrations = registrations.filter(reg => reg.contestId);

        contestSpent = registrations.reduce((sum, reg) => {
            if (reg.paymentStatus === 'confirmed' && reg.registrationStatus === 'confirmed') {
                return sum + (reg.amount || 0);
            }
            return sum;
        }, 0);
        updateTotalSpentDisplay();
        
        const container = document.getElementById('myContestsList');
        const countDisplay = document.getElementById('contestCount');

        countDisplay.innerText = registrations.length;

        if (registrations.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <p>🎯 No contest registrations yet</p>
                    <p style="font-size: 0.9rem;">
                        <a href="index.html#contests" style="color: var(--primary-color);">Browse contests →</a>
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = registrations.map(reg => `
            <div class="registration-item">
                <h4>🏆 ${reg.contestId.title}</h4>
                <div class="registration-detail">
                    <strong>Team:</strong> ${reg.teamName}
                </div>
                <div class="registration-detail">
                    <strong>Members:</strong> ${reg.teamMembers ? reg.teamMembers.length : 1} / ${reg.contestId.registrationFee ? '?' : '?'}
                </div>
                <div class="registration-detail">
                    <strong>Prize Pool:</strong> ${reg.contestId.prize || 'TBA'}
                </div>
                <div class="registration-detail">
                    <strong>Amount Paid:</strong> ৳${reg.amount || 0}
                </div>
                <div class="registration-detail">
                    <strong>Status:</strong> 
                    <span class="status-badge ${reg.registrationStatus || 'pending'}">
                        ${(reg.registrationStatus || 'pending').toUpperCase()}
                    </span>
                </div>
                <div class="registration-detail">
                    <strong>Payment:</strong> ${(reg.paymentStatus || 'pending').toUpperCase()}
                </div>
                <div class="registration-detail">
                    <strong>Gateway:</strong> ${reg.paymentGateway}
                </div>
                <div class="registration-detail" style="word-break: break-all;">
                    <strong>Transaction ID:</strong> <code style="background: rgba(99, 102, 241, 0.1); padding: 4px; border-radius: 4px;">${reg.transactionId}</code>
                </div>
                ${reg.registrationStatus !== 'cancelled' ? `
                    <button class="cancel-btn" onclick="cancelContestRegistration('${reg._id}')">
                        ✕ Cancel Registration
                    </button>
                ` : ''}
            </div>
        `).join('');

        console.log('✅ Contest registrations loaded:', registrations);

    } catch (error) {
        console.error('❌ Error loading contest registrations:', error);
    }
}

// ==================== CANCEL EVENT REGISTRATION ====================

async function cancelEventRegistration(registrationId) {
    if (!confirm('Are you sure you want to cancel this event registration?')) {
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`http://localhost:5000/api/event-registration/cancel/${registrationId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            alert('✅ Event registration cancelled successfully');
            loadEventRegistrations();
        } else {
            alert('❌ ' + (data.message || 'Failed to cancel registration'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Server error');
    }
}

// ==================== CANCEL CONTEST REGISTRATION ====================

async function cancelContestRegistration(registrationId) {
    if (!confirm('Are you sure you want to cancel this contest registration?')) {
        return;
    }

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`http://localhost:5000/api/contest-registration/cancel/${registrationId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            alert('✅ Contest registration cancelled successfully');
            loadContestRegistrations();
        } else {
            alert('❌ ' + (data.message || 'Failed to cancel registration'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Server error');
    }
}

console.log('✅ Member dashboard script loaded!');