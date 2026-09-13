
        // // Login form submission
        // const loginForm = document.getElementById('loginForm');

        // if (loginForm) {
        //     loginForm.addEventListener('submit', async (e) => {
        //         e.preventDefault();

        //         const email = document.getElementById('email').value;
        //         const password = document.getElementById('password').value;

        //         // Simple validation
        //         if (!email || !password) {
        //             alert('Please fill in all fields!');
        //             return;
        //         }

        //         try {
        //             // 1. Send the login request to the backend
        //             const response = await fetch('http://localhost:5000/api/auth/login', {
        //                 method: 'POST',
        //                 headers: {
        //                     'Content-Type': 'application/json'
        //                 },
        //                 body: JSON.stringify({ email, password })
        //             });

        //             const data = await response.json();

        //             // 2. Check if login was successful
        //             if (response.ok) {
        //                 // Save the JWT token in local storage for future authenticated requests
        //                 localStorage.setItem('token', data.token);
        //                 localStorage.setItem('userName', data.name);
        //                 localStorage.setItem('userRole', data.role);
                        
        //                 alert(`Welcome back, ${data.name}!`);

        //                 // 3. Redirect based on the user's role
        //                 if (data.role === 'admin') {
        //                     window.location.href = 'admin_dashboard.html'; // Create this page if you haven't yet
        //                 } else {
        //                     window.location.href = '../member_dashboard.html'; // Create this page if you haven't yet
        //                 }
        //             } else {
        //                 // If login failed (e.g., wrong password, user not found)
        //                 alert(data.message || 'Login failed! Please check your credentials.');
        //             }
        //         } catch (error) {
        //             console.error('Error during login:', error);
        //             alert('Server error! Could not connect to the backend.');
        //         }
        //     });
        // }
    