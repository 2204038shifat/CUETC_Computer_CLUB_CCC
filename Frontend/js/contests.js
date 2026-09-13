// ==================== CONTEST REGISTRATION ====================

// Register for contest
async function registerContest(contestId) {
    const token = localStorage.getItem('token');

    // Check if user is logged in
    if (!token) {
        alert('Please login first to register for contests!');
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/api/data/contests/register/${contestId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert('✅ Successfully registered for the contest!');
            console.log('Registered for contest:', data.contest);
            
            // Refresh the page to show updated status
            location.reload();
        } else {
            alert('❌ ' + (data.message || 'Failed to register'));
            console.error('Registration error:', data.message);
        }
    } catch (error) {
        console.error('❌ Error registering for contest:', error);
        alert('Server error! Could not register. Make sure backend is running.');
    }
}

// Unregister from contest
async function unregisterContest(contestId) {
    const token = localStorage.getItem('token');

    if (!token) {
        alert('Please login first!');
        window.location.href = 'login.html';
        return;
    }

    if (!confirm('Are you sure you want to unregister?')) {
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/api/data/contests/unregister/${contestId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert('✅ Successfully unregistered from the contest!');
            location.reload();
        } else {
            alert('❌ ' + (data.message || 'Failed to unregister'));
        }
    } catch (error) {
        console.error('❌ Error unregistering:', error);
        alert('Server error!');
    }
}

// ==================== EVENT REGISTRATION ====================

// Register for event
async function registerEvent(eventId) {
    const token = localStorage.getItem('token');

    if (!token) {
        alert('Please login first to register for events!');
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/api/data/events/register/${eventId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert('✅ Successfully registered for the event!');
            console.log('Registered for event:', data.event);
            location.reload();
        } else {
            alert('❌ ' + (data.message || 'Failed to register'));
        }
    } catch (error) {
        console.error('❌ Error registering for event:', error);
        alert('Server error!');
    }
}

// Unregister from event
async function unregisterEvent(eventId) {
    const token = localStorage.getItem('token');

    if (!token) {
        alert('Please login first!');
        window.location.href = 'login.html';
        return;
    }

    if (!confirm('Are you sure you want to unregister?')) {
        return;
    }

    try {
        const response = await fetch(`http://localhost:5000/api/data/events/unregister/${eventId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert('✅ Successfully unregistered from the event!');
            location.reload();
        } else {
            alert('❌ ' + (data.message || 'Failed to unregister'));
        }
    } catch (error) {
        console.error('❌ Error unregistering:', error);
        alert('Server error!');
    }
}

console.log('✅ Contests & Events registration loaded!');