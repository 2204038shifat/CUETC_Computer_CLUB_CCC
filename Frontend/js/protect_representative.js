(function() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    
    // If no token or not representative, redirect
    if (!token || role !== 'representative') {
        alert('Representative access only!');
        window.location.replace('login.html');
    }
})();