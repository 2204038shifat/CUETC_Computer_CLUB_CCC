// ==================== MOBILE MENU TOGGLE ====================

const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');
const navLink = document.querySelectorAll('.nav-link');

if (hamburger && navLinks) {
    // Toggle mobile menu
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
    });

    // Close menu when a link is clicked
    navLink.forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('active');
        });
    });
}


// ==================== DYNAMIC NAVBAR AUTHENTICATION ====================



// ==================== DYNAMIC NAVBAR AUTHENTICATION ====================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Get user data from browser memory
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');  // ✅ FIXED
    const name = localStorage.getItem('userName');  // ✅ FIXED

    // 2. Get the HTML elements
    const loginNavItem = document.getElementById('login-nav-item');
    const profileNavItem = document.getElementById('profile-nav-item');
    const profileLink = document.getElementById('profile-link');
    const navUserName = document.getElementById('nav-user-name');

    // 3. Check if user is logged in
    if (token) {
        // User IS logged in: Hide Login, Show Profile
        if (loginNavItem) loginNavItem.style.display = 'none';
        if (profileNavItem) profileNavItem.style.display = 'block';
        
        // Set the link destination based on their role
        if (profileLink) {
            if (role === 'admin') {
                profileLink.href = 'admin_dashboard.html';
            } else if (role === 'representative') {
                profileLink.href = 'representative_dashboard.html';
            } else {
                profileLink.href = 'member_dashboard.html';
            }
        }

        // Show appropriate label
        if (navUserName) {
            if (role === 'admin') {
                navUserName.textContent = 'Admin Dashboard';
            } else if (role === 'representative') {
                navUserName.textContent = 'Representative Portal';
            } else {
                navUserName.textContent = (name ? name.split(' ')[0] : 'Member Dashboard');
            }
        }
    } else {
        // User is NOT logged in: Show Login, Hide Profile
        if (loginNavItem) loginNavItem.style.display = 'block';
        if (profileNavItem) profileNavItem.style.display = 'none';
    }
});






// ==================== SMOOTH SCROLLING NAVIGATION ====================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ==================== ACTIVE NAV LINK ON SCROLL ====================

window.addEventListener('scroll', () => {
    let current = '';
    
    document.querySelectorAll('section').forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        
        if (scrollY >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });

    navLink.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').slice(1) === current) {
            link.classList.add('active');
        }
    });
});

// ==================== ANIMATED COUNTER FOR STATS ====================

function animateCounter() {
    const statValues = document.querySelectorAll('.stat-value');

    statValues.forEach(statValue => {
        const finalCount = parseInt(statValue.getAttribute('data-count'));
        let currentCount = 0;
        const increment = Math.ceil(finalCount / 50); // 50 steps animation
        const interval = 30; // milliseconds

        const counter = setInterval(() => {
            currentCount += increment;
            
            if (currentCount >= finalCount) {
                statValue.textContent = finalCount;
                clearInterval(counter);
            } else {
                statValue.textContent = currentCount;
            }
        }, interval);
    });
}

// Trigger animation when stats section is visible
window.addEventListener('scroll', () => {
    const statsContainer = document.querySelector('.stats-container');
    const statsPosition = statsContainer.getBoundingClientRect().top;
    const screenPosition = window.innerHeight / 1.3;

    if (statsPosition < screenPosition && !statsContainer.classList.contains('animated')) {
        statsContainer.classList.add('animated');
        animateCounter();
    }
});

// ==================== SCROLL REVEAL ANIMATIONS ====================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('section').forEach(section => {
        if (section.id !== 'home') {
            section.style.opacity = '0';
            section.style.transform = 'translateY(30px)';
            section.style.transition = 'all 0.6s ease-out';
            observer.observe(section);
        }
    });
});

// ==================== SMOOTH NAVBAR SHADOW ON SCROLL ====================

window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5)';
    } else {
        navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
    }
});

// ==================== PREVENT BODY SCROLL WHEN MOBILE MENU IS OPEN ====================

hamburger.addEventListener('click', () => {
    if (navLinks.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'auto';
    }
});

// ==================== DARK/LIGHT MODE TOGGLE ====================

const themeToggle = document.getElementById('themeToggle');
const htmlElement = document.documentElement;
const body = document.body;

// Check for saved theme preference or default to 'dark'
const currentTheme = localStorage.getItem('theme') || 'dark';

// Apply theme on page load
if (currentTheme === 'light') {
    body.classList.add('light-mode');
    themeToggle.textContent = '☀️';
} else {
    body.classList.remove('light-mode');
    themeToggle.textContent = '🌙';
}

// Toggle theme on button click
themeToggle.addEventListener('click', () => {
    body.classList.toggle('light-mode');
    
    // Update localStorage and button
    if (body.classList.contains('light-mode')) {
        localStorage.setItem('theme', 'light');
        themeToggle.textContent = '☀️';
    } else {
        localStorage.setItem('theme', 'dark');
        themeToggle.textContent = '🌙';
    }
});

// ==================== CONTACT FORM SUBMISSION ====================

const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Get form values
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const subject = document.getElementById('subject').value;
        const message = document.getElementById('message').value;
        
        // Simple validation
        if (!name || !email || !subject || !message) {
            alert('Please fill in all fields!');
            return;
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Please enter a valid email address!');
            return;
        }
        
        // Success message (in a real app, you would send this to a server)
        alert(`Thank you for your message, ${name}! We'll get back to you soon.`);
        
        // Reset form
        contactForm.reset();
        
        // Note: To actually send emails, you would need to:
        // 1. Use a backend service like FormSubmit, Netlify Forms, or SendGrid
        // 2. Set up an API endpoint
        // 3. For now, this just validates and shows a message
    });
}

// ==================== FORM INPUT FOCUS ANIMATION ====================

const formInputs = document.querySelectorAll('.form-input, .form-textarea');

formInputs.forEach(input => {
    input.addEventListener('focus', () => {
        input.parentElement.classList.add('focused');
    });
    
    input.addEventListener('blur', () => {
        input.parentElement.classList.remove('focused');
    });
});

// ==================== LAZY LOADING IMAGES (Optional for future) ====================

// This is ready for when you add actual images
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// ==================== SCROLL BACK TO TOP ====================

const scrollToTopBtn = document.createElement('button');
scrollToTopBtn.textContent = '↑';
scrollToTopBtn.className = 'scroll-to-top';
scrollToTopBtn.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 30px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1 0%, #ec4899 100%);
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    opacity: 0;
    transition: all 0.3s ease;
    z-index: 998;
    pointer-events: none;
    box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4);
`;

document.body.appendChild(scrollToTopBtn);

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        scrollToTopBtn.style.opacity = '1';
        scrollToTopBtn.style.pointerEvents = 'auto';
    } else {
        scrollToTopBtn.style.opacity = '0';
        scrollToTopBtn.style.pointerEvents = 'none';
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

scrollToTopBtn.addEventListener('hover', () => {
    scrollToTopBtn.style.transform = 'scale(1.1)';
});

// ==================== PERFORMANCE: DEBOUNCE SCROLL EVENTS ====================

function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// ==================== LOGGING ====================

console.log('✅ Tech Club Website - All Features Loaded Successfully!');
console.log('📋 Available Features:');
console.log('  • Mobile Menu Toggle');
console.log('  • Smooth Scrolling Navigation');
console.log('  • Active Link Highlighting');
console.log('  • Animated Stats Counters');
console.log('  • Scroll Reveal Animations');
console.log('  • Dark/Light Mode Toggle (Saved to localStorage)');
console.log('  • Contact Form Validation');
console.log('  • Scroll to Top Button');
console.log('🎨 Theme:', localStorage.getItem('theme') || 'dark');