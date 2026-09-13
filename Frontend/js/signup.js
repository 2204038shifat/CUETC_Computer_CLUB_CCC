
    const signupForm = document.getElementById('signupForm');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const studentId = document.getElementById('studentId').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const terms = document.getElementById('terms').checked;

            // Basic Validation
            if (!terms) return alert('Please agree to the Terms & Conditions!');
            if (password.length < 6) return alert('Password must be at least 6 characters long!');
            if (password !== confirmPassword) return alert('Passwords do not match!');

            try {
                // 1. Send data to the Backend
                const response = await fetch('http://localhost:5000/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, studentId, password, confirmPassword })
                });

                const data = await response.json();

                // 2. Check if registration was successful
                if (response.ok) {
                    alert(`Welcome ${name}! Your account has been created.`);
                    
                    // Optional: Automatically log them in by saving the token
                    if (data.token) {
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('userName', data.user.name);
                        localStorage.setItem('userRole', data.user.role);
                        window.location.href = 'member_dashboard.html';
                    } else {
                        // Or just redirect to login
                        window.location.href = 'login.html';
                    }
                } else {
                    // Backend returned an error (e.g., Email already exists)
                    alert(`Registration failed: ${data.message}`);
                }
            } catch (error) {
                console.error('Error during signup:', error);
                alert('Server error. Make sure the backend route /api/auth/register exists and is running.');
            }
        });
    }
