// Check if user is logged in
const token = localStorage.getItem('token');

if (!token) {
    alert('Please log in to access your dashboard.');
    window.location.href = 'login.html'; // Kick them out to login page
}