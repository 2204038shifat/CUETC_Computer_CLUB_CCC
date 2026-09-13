(function() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');  // ✅ IMPORTANT
    
    // If no token or not admin, redirect
    if (!token || role !== 'admin') {
        alert('Admin access only!');
        window.location.replace('login.html');
    }
})();