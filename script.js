/* jshint esversion: 6 */

let socket;
try {
    socket = io('http://localhost:3000'); // Переконайтесь, що URL правильний
    console.log('Socket.IO успішно підключено (script.js)');
} catch (error) {
    console.error('Помилка підключення Socket.IO (script.js):', error);
}

let currentUserId = null;
let currentUsername = null;

let currentPage = 1;
let totalPages = 1;
let selectedStudentIds = [];

// Допоміжна функція для оновлення стану червоної крапки
function updateNotificationDotState() {
    const notificationContainer = document.getElementById('notification');
    if (!notificationContainer) return;
    const notificationDot = notificationContainer.querySelector('.notification-dot');
    const bmodal = notificationContainer.querySelector('.bmodal');

    if (bmodal && notificationDot) {
        if (bmodal.children.length > 0) {
            notificationDot.style.display = 'block';
            notificationDot.classList.add('active');
        } else {
            notificationDot.style.display = 'none';
            notificationDot.classList.remove('active');
        }
    }
}

// Функція показу сповіщень
function showNotification(messageData) {
    const { sender, message, groupChatId, groupName } = messageData; // Додано groupName
    const notificationContainer = document.getElementById('notification');
    if (!notificationContainer) return;

    const notificationDot = notificationContainer.querySelector('.notification-dot');
    const bmodal = notificationContainer.querySelector('.bmodal');
    const bell = notificationContainer.querySelector('.bell');
    
    const MAX_NOTIFICATIONS = 3;
    const senderIdForNotification = groupChatId ? `group_${groupChatId}` : sender.id.toString();
    const displayName = groupChatId ? (groupName || `Group ${groupChatId}`) : sender.username;

    const existingNotification = bmodal.querySelector(`.message[data-source-id="${senderIdForNotification}"]`);
    if (existingNotification) {
        existingNotification.remove();
    }

    const newMessageDiv = document.createElement('div');
    newMessageDiv.className = 'message';
    newMessageDiv.dataset.sourceId = senderIdForNotification;
    newMessageDiv.innerHTML = `
        <img src="/PI/images/account.png" alt="User picture" class="avatar">
        <div class="message-box">
            <div class="message-content">
                <h2>${displayName}</h2>
                <p>${groupChatId ? sender.username + ': ' : ''}${message}</p>
            </div>
        </div>
    `;

    newMessageDiv.addEventListener('click', () => {
        newMessageDiv.remove();
        updateNotificationDotState();
        const targetUrl = groupChatId 
            ? `messages.html?group_chat=${groupChatId}` 
            : `messages.html?chat=${sender.id}`;
        window.location.href = targetUrl;
    });

    bmodal.prepend(newMessageDiv);

    while (bmodal.children.length > MAX_NOTIFICATIONS) {
        bmodal.removeChild(bmodal.lastChild);
    }

    notificationContainer.style.display = 'block';
    if (notificationDot) {
        notificationDot.style.display = 'block';
        notificationDot.classList.add('active');
    }
    
    if (bell) {
        bell.classList.add('ringing');
        setTimeout(() => {
            bell.classList.remove('ringing');
        }, 600);
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    console.log("Hello from script.js!");
    await checkLoginStatus();
    initializeAuthHandlers();
    updateNotificationDotState(); // Ініціалізація стану крапки при завантаженні

    const notificationBell = document.querySelector('.notification .bell');
    const notificationDot = document.querySelector('.notification .notification-dot'); // Для обробки кліку на дзвінок

    if (notificationBell) {
        notificationBell.addEventListener('click', function (e) {
            e.preventDefault();
            if (!localStorage.getItem('isLoggedIn')) {
                alert('Please log in to view messages.');
                return;
            }
            // Крапку не видаляємо тут, це робиться при відкритті чату або кліку на сповіщення
            // if (notificationDot) notificationDot.classList.remove('active');
            setTimeout(function () {
                window.location.href = 'messages.html';
            }, 300);
        });
    }

    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function () {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            this.querySelector('i').classList.toggle('fa-eye');
            this.querySelector('i').classList.toggle('fa-eye-slash');
        });
    }

    const dashboardLink = document.querySelector('a[href="dashboard.html"]');
    const tasksLink = document.querySelector('a[href="tasks.html"]');

    if (dashboardLink) {
        dashboardLink.addEventListener('click', function (e) {
            if (!localStorage.getItem('isLoggedIn')) {
                e.preventDefault();
                alert('Please log in to access Dashboard.');
            }
        });
    }

    if (tasksLink) {
        tasksLink.addEventListener('click', function (e) {
            if (!localStorage.getItem('isLoggedIn')) {
                e.preventDefault();
                alert('Please log in to access Tasks.');
            }
        });
    }

    if (document.getElementById('studentTable')) {
        initializeStudentPage();
    }
});

//============================ AUTHORIZATION =============================

async function checkLoginStatus() {
    try {
        const response = await fetch('/PI/api/check_session.php', {
            headers: { 'Cache-Control': 'no-cache' }
        });
        const result = await response.json();

        if (result.success) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('username', result.username);
            currentUsername = result.username;

            const userResponse = await fetch('/PI/api/get_user_id.php');
            const userData = await userResponse.json();
            if (userData.success && socket) {
                currentUserId = userData.userId;
                socket.emit('auth', { username: currentUsername, id: currentUserId });
            }

            updateUIForLoggedInUser();
            if (document.getElementById('studentTable')) {
                loadStudents();
            }
        } else {
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('username');
            currentUserId = null;
            currentUsername = null;
            updateUIForLoggedOutUser();
            if (document.getElementById('studentTable')) {
                clearTable();
            }
        }
    } catch (error) {
        console.error('Error checking session:', error);
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('username');
        currentUserId = null;
        currentUsername = null;
        updateUIForLoggedOutUser();
        if (document.getElementById('studentTable')) {
            clearTable();
        }
    }
}

function updateUIForLoggedInUser() {
    const username = localStorage.getItem('username') || 'User';
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notification = document.getElementById('notification');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const addButton = document.getElementById('addbutton');

    if (loginButton) loginButton.style.display = 'none';
    if (account) account.style.display = 'flex';
    if (notification) notification.style.display = 'block'; // Показуємо контейнер сповіщень
    if (usernameDisplay) usernameDisplay.textContent = username;
    if (addButton) {
        addButton.style.cursor = 'pointer';
        addButton.disabled = false;
    }
}

function updateUIForLoggedOutUser() {
    const loginButton = document.getElementById('loginButton');
    const account = document.getElementById('account');
    const notification = document.getElementById('notification');
    const addButton = document.getElementById('addbutton');

    if (loginButton) loginButton.style.display = 'flex';
    if (account) account.style.display = 'none';
    if (notification) notification.style.display = 'none'; // Ховаємо контейнер сповіщень
    if (addButton) {
        addButton.style.cursor = 'not-allowed';
        addButton.disabled = true;
    }
}

function showLoginModal() {
    const modalLogin = document.getElementById('modalLogin');
    if (modalLogin) {
        modalLogin.style.display = 'flex';
    }
}

function hideLoginModal() {
    const modalLogin = document.getElementById('modalLogin');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    
    if (modalLogin) {
        modalLogin.style.display = 'none';
    }
    if (loginForm) {
        loginForm.reset();
    }
    if (loginError) {
        loginError.style.display = 'none';
        loginError.textContent = '';
    }
}

function initializeAuthHandlers() {
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.removeEventListener('click', showLoginModal);
        loginButton.addEventListener('click', function(e) {
            e.preventDefault();
            showLoginModal();
        });
        loginButton.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showLoginModal();
            }
        });
    }

    const closeLoginModalBtn = document.getElementById('closeLoginModal'); // Змінено ім'я для уникнення конфлікту
    const cancelLoginBtn = document.getElementById('cancelLoginBtn');
    const loginForm = document.getElementById('loginForm');
    const modalLogin = document.getElementById('modalLogin');


    if (closeLoginModalBtn) {
        closeLoginModalBtn.removeEventListener('click', hideLoginModal);
        closeLoginModalBtn.addEventListener('click', hideLoginModal);
    }

    if (cancelLoginBtn) {
        cancelLoginBtn.removeEventListener('click', hideLoginModal);
        cancelLoginBtn.addEventListener('click', hideLoginModal);
    }

    if (modalLogin) {
        modalLogin.addEventListener('click', function(e) {
            if (e.target === modalLogin) {
                hideLoginModal();
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const usernameInput = document.getElementById('username'); // Змінено ім'я
            const passwordInput = document.getElementById('password'); // Змінено ім'я
            const loginError = document.getElementById('loginError');

            const usernameVal = usernameInput.value; // Змінено ім'я
            const passwordVal = passwordInput.value; // Змінено ім'я


            try {
                const response = await fetch('/PI/api/login.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: usernameVal, password: passwordVal })
                });
                const result = await response.json();

                if (result.success) {
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('username', usernameVal);
                    currentUsername = usernameVal; // Оновлюємо глобальну змінну

                    const userResponse = await fetch('/PI/api/get_user_id.php');
                    const userData = await userResponse.json();
                    
                    if (userData.success && socket) {
                        currentUserId = userData.userId; // Оновлюємо глобальну змінну
                        socket.emit('auth', {
                            username: usernameVal,
                            id: userData.userId
                        });
                    }
                    
                    hideLoginModal();
                    updateUIForLoggedInUser();
                    
                    if (document.getElementById('studentTable')) {
                        loadStudents();
                    }
                } else {
                    loginError.textContent = result.message || 'Помилка авторизації';
                    loginError.style.display = 'block';
                }
            } catch (error) {
                console.error('Error during login:', error);
                loginError.textContent = 'Помилка підключення до сервера';
                loginError.style.display = 'block';
            }
        });
    }
}

if (document.getElementById('logoutButton')) {
    document.getElementById('logoutButton').addEventListener('click', async function(e) {
        e.preventDefault();
        try {
            const response = await fetch('/PI/api/logout.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();

            if (result.success) {
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('username');
                selectedStudentIds = [];
                currentUserId = null;
                currentUsername = null;
                if(socket) socket.disconnect(); // Розриваємо з'єднання при виході
                
                updateUIForLoggedOutUser();
                if (document.getElementById('studentTable')) {
                    clearTable();
                }
                 // Перезавантажуємо сторінку, щоб все скинулося
                window.location.reload();
            }
        } catch (error) {
            console.error('Logout failed:', error);
        }
    });
}

//========================== STUDENTS ====================================

function initializeStudentPage() {
    const table = document.getElementById('studentTable');
    const selectAllCheckbox = document.getElementById('selectAll');

    // loadStudents() викликається з checkLoginStatus або при зміні сторінки

    document.getElementById('addbutton').addEventListener('click', function() {
        if (!localStorage.getItem('isLoggedIn')) {
            alert('Please log in to add students.');
            return;
        }
        document.getElementById('modal').style.display = 'flex';
    });

    document.getElementById('closeModal').addEventListener('click', function() {
        document.getElementById('modal').style.display = 'none';
        document.getElementById('studentForm').reset();
        clearFormErrors('studentForm');
    });

    document.getElementById('cancelBtn').addEventListener('click', function() {
        document.getElementById('modal').style.display = 'none';
        document.getElementById('studentForm').reset();
        clearFormErrors('studentForm');
    });

    document.getElementById('studentForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const group = document.getElementById('group');
        const firstName = document.getElementById('firstName');
        const lastName = document.getElementById('lastName');
        const gender = document.getElementById('gender');
        const birthday = document.getElementById('birthday');

        clearFormErrors('studentForm');

        const allFieldsAreGood = checkField(group) && checkField(firstName) && 
                                checkField(lastName) && checkField(gender) && 
                                checkField(birthday);

        if (allFieldsAreGood) {
            try {
                const response = await fetch('/PI/api/add_student.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group: group.value,
                        firstName: firstName.value,
                        lastName: lastName.value,
                        gender: gender.value,
                        birthday: birthday.value 
                    })
                });
                const result = await response.json();

                if (result.success) {
                    document.getElementById('modal').style.display = 'none';
                    this.reset();
                    loadStudents(currentPage);
                } else {
                    console.log('Server error:', result);
                    displayServerErrors('studentForm', result.errors);
                }
            } catch (error) {
                console.error('Error adding student:', error);
                displayServerErrors('studentForm', { general: 'Failed to add student: ' + error.message });
            }
        }
    });

    if(table) { // Додано перевірку наявності таблиці
        table.addEventListener('change', function(e) {
            if (e.target.classList.contains('rowCheck')) {
                const row = e.target.closest('tr');
                const studentId = parseInt(row.cells[7].textContent);
                if (e.target.checked) {
                    if (!selectedStudentIds.includes(studentId)) {
                        selectedStudentIds.push(studentId);
                    }
                } else {
                    selectedStudentIds = selectedStudentIds.filter(id => id !== studentId);
                }
                updateRowButtons(row, e.target.checked);
                updateSelectAllCheckbox();
            }
        });

        table.addEventListener('click', async function(e) {
            const target = e.target;

            const button = target.closest('button');
            if (!button || button.classList.contains('disabled')) return;

            const row = button.closest('tr');
            const id = parseInt(row.cells[7].textContent);
            const nameCell = row.cells[2].textContent;
            const [firstName, lastName] = nameCell.split(' ');

            if (button.querySelector('.fa-trash')) {
                const deleteModal = document.getElementById('modalDel');
                const deleteMessage = document.getElementById('deleteMessage');
                deleteMessage.textContent = `Are you sure you want to delete student ${firstName} ${lastName}?`;
                deleteModal.style.display = 'flex';

                document.getElementById('closeDelModal').onclick = function() {
                    deleteModal.style.display = 'none';
                };

                document.getElementById('cancelDelBtn').onclick = function() {
                    deleteModal.style.display = 'none';
                };

                document.getElementById('confirmDelBtn').onclick = async function() {
                    try {
                        const response = await fetch('/PI/api/delete_student.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id })
                        });
                        const result = await response.json();

                        if (result.success) {
                            selectedStudentIds = selectedStudentIds.filter(studentId => studentId !== id);
                            deleteModal.style.display = 'none';
                            loadStudents(currentPage);
                        } else {
                            console.error('Error deleting student:', result.message || 'Unknown error');
                        }
                    } catch (error) {
                        console.error('Error deleting student:', error);
                    }
                };
            } else if (button.querySelector('.fa-pen-to-square')) {
                const editModal = document.getElementById('modalEdit');
                editModal.style.display = 'flex';

                document.getElementById('editGroup').value = row.cells[1].textContent;
                document.getElementById('editFirstName').value = firstName;
                document.getElementById('editLastName').value = lastName;
                document.getElementById('editGender').value = row.cells[3].textContent;
                document.getElementById('editBirthday').value = row.cells[4].textContent;
                editModal.dataset.editingRow = row.rowIndex;
                editModal.dataset.studentId = id;

                document.getElementById('closeEditModal').onclick = function() {
                    editModal.style.display = 'none';
                    clearFormErrors('editStudentForm');
                };

                document.getElementById('cancelEditBtn').onclick = function() {
                    editModal.style.display = 'none';
                    clearFormErrors('editStudentForm');
                };
            }
        });
    }


    document.getElementById('saveEditBtn').addEventListener('click', async function() {
        const group = document.getElementById('editGroup');
        const firstName = document.getElementById('editFirstName');
        const lastName = document.getElementById('editLastName');
        const gender = document.getElementById('editGender');
        const birthday = document.getElementById('editBirthday');
        const editModal = document.getElementById('modalEdit');
        const id = parseInt(editModal.dataset.studentId);

        clearFormErrors('editStudentForm');

        const allFieldsAreGood = checkField(group) && checkField(firstName) && 
                                checkField(lastName) && checkField(gender) && 
                                checkField(birthday);

        if (allFieldsAreGood) {
            try {
                const response = await fetch('/PI/api/edit_student.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id,
                        group: group.value,
                        firstName: firstName.value,
                        lastName: lastName.value,
                        gender: gender.value,
                        birthday: birthday.value
                    })
                });
                const result = await response.json();

                if (result.success) {
                    document.getElementById('modalEdit').style.display = 'none';
                    loadStudents(currentPage);
                } else {
                    displayServerErrors('editStudentForm', result.errors);
                }
            } catch (error) {
                console.error('Error editing student:', error);
                displayServerErrors('editStudentForm', { general: 'Failed to edit student' });
            }
        }
    });

    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            loadStudents(currentPage - 1);
        }
    });

    document.getElementById('nextPage').addEventListener('click', () => {
        if (currentPage < totalPages) {
            loadStudents(currentPage + 1);
        }
    });
}

async function loadStudents(page = 1) {
    if (!localStorage.getItem('isLoggedIn')) {
        clearTable();
        return;
    }

    try {
        const response = await fetch(`/PI/api/get_students.php?page=${page}&t=${new Date().getTime()}`, { // Змінено URL
            headers: { 'Cache-Control': 'no-cache' }
        });
        const result = await response.json();

        if (result.success) {
            clearTable(); // Очищаємо перед заповненням
            result.students.forEach(student => {
                const isChecked = selectedStudentIds.includes(student.id);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="checkbox" class="rowCheck" title="Select student" ${isChecked ? 'checked' : ''}></td>
                    <td>${student.group}</td>
                    <td>${student.name}</td>
                    <td>${student.gender}</td>
                    <td>${student.birthday}</td>
                    <td><i class="fa-solid fa-circle ${student.status === 'Active' ? 'status-active' : 'status-inactive'}" data-id="${student.id}"></i></td>
                    <td>
                        <button class="button-ed ${isChecked ? 'active' : 'disabled'}" aria-label="Edit student" title="Edit student" ${isChecked && localStorage.getItem('isLoggedIn') ? '' : 'disabled'}>
                            <i class="fa-solid fa-pen-to-square" data-id="${student.id}"></i>
                        </button>
                        <button class="button-ed ${isChecked ? 'active' : 'disabled'}" aria-label="Delete student" title="Delete student" ${isChecked && localStorage.getItem('isLoggedIn') ? '' : 'disabled'}>
                            <i class="fa-solid fa-trash" data-id="${student.id}"></i>
                        </button>
                    </td>
                    <td style="display: none;">${student.id}</td>
                `;
                document.getElementById('studentTable').appendChild(row);
            });

            currentPage = result.currentPage;
            totalPages = result.totalPages;
            updatePagination();
            updateSelectAllCheckbox();
        } else {
            console.error('Error loading students:', result.message || 'Unknown error');
        }
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

function clearTable() {
    const table = document.getElementById('studentTable');
    if (table) {
        while (table.rows.length > 1) {
            table.deleteRow(1);
        }
    }
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) pageInfo.textContent = '';
    const prevPage = document.getElementById('prevPage');
    if (prevPage) prevPage.disabled = true;
    const nextPage = document.getElementById('nextPage');
    if (nextPage) nextPage.disabled = true;
}

function updatePagination() {
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    const prevPage = document.getElementById('prevPage');
    if (prevPage) prevPage.disabled = currentPage === 1;
    const nextPage = document.getElementById('nextPage');
    if (nextPage) nextPage.disabled = currentPage === totalPages;
}

function updateSelectAllCheckbox() {
    const table = document.getElementById('studentTable');
    const selectAllCheckbox = document.getElementById('selectAll');
    if (table && selectAllCheckbox) {
        const allCheckboxes = table.querySelectorAll('.rowCheck');
        const allChecked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
    }
}

function updateRowButtons(row, isChecked) {
    const buttons = row.querySelectorAll('.button-ed');
    buttons.forEach(button => {
        if (isChecked && localStorage.getItem('isLoggedIn')) {
            button.classList.remove('disabled');
            button.classList.add('active');
            button.disabled = false;
        } else {
            button.classList.remove('active');
            button.classList.add('disabled');
            button.disabled = true;
        }
    });
}

//================================ VALIDATION | FORMS ======================================

function checkField(field) {
    let isGood = true;
    let errorMessage = '';

    if (field.value.trim() === '') {
        isGood = false;
        errorMessage = 'This field cannot be empty';
    } else if (field.id === 'group' || field.id === 'editGroup') {
        if (!/^PZ-\d{2}$/.test(field.value)) {
            isGood = false;
            errorMessage = 'Group must be in format PZ-XX (e.g., PZ-11)';
        }
    } else if (field.id === 'firstName' || field.id === 'lastName' || 
               field.id === 'editFirstName' || field.id === 'editLastName') {
        const value = field.value.trim();
        if (!/^[A-Za-zА-Яа-яҐґЄєІіЇї'\s-]{1,50}$/.test(value)) { // Додано \s для пробілів
            isGood = false;
            errorMessage = 'Use only letters (English or Ukrainian), spaces, apostrophes, or hyphens (1-50 characters)';
        }
    } else if (field.id === 'gender' || field.id === 'editGender') {
        if (!['Male', 'Female'].includes(field.value)) {
            isGood = false;
            errorMessage = 'Gender must be Male or Female';
        }
    } else if (field.id === 'birthday' || field.id === 'editBirthday') {
        const inputDate = new Date(field.value);
        const currentDate = new Date();
        currentDate.setHours(0,0,0,0); // Для коректного порівняння тільки дати
        const year = inputDate.getFullYear();

        if (isNaN(inputDate.getTime())) {
            isGood = false;
            errorMessage = 'Invalid date format';
        } else if (inputDate > currentDate) {
            isGood = false;
            errorMessage = 'Date cannot be in the future';
        } else if (year < 1900 || year > new Date().getFullYear()) { // Використовуємо поточний рік
            isGood = false;
            errorMessage = 'Year must be between 1900 and ' + new Date().getFullYear();
        }
    }

    if (!isGood) {
        field.style.border = '1px solid red';
        let error = field.nextElementSibling;
        if (!error || !error.classList.contains('error-message')) {
            error = document.createElement('span');
            error.className = 'error-message';
            field.parentNode.insertBefore(error, field.nextSibling);
        }
        error.textContent = errorMessage;
    } else {
        field.style.border = '1px solid #ddd';
        let error = field.nextElementSibling;
        if (error && error.classList.contains('error-message')) {
            error.remove();
        }
    }
    return isGood;
}

function clearFormErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const fields = form.querySelectorAll('input, select');
    fields.forEach(field => {
        field.style.border = '1px solid #ddd';
        const error = field.nextElementSibling;
        if (error && error.classList.contains('error-message')) {
            error.remove();
        }
    });
    // Видаляємо загальні помилки форми
    const generalError = form.querySelector('.error-message.general-form-error');
    if (generalError) {
        generalError.remove();
    }
}

function displayServerErrors(formId, errors) {
    clearFormErrors(formId);
    const form = document.getElementById(formId);
    if (!form) return;
    for (const [field, message] of Object.entries(errors)) {
        if (field === 'general') {
            const generalError = document.createElement('span');
            generalError.className = 'error-message general-form-error'; // Додано клас для легкого видалення
            generalError.textContent = message;
            // Додаємо загальну помилку або в кінець форми, або в спеціальний контейнер, якщо він є
            const footer = form.closest('.modal-content').querySelector('.modal-footer');
            if (footer) {
                footer.parentNode.insertBefore(generalError, footer);
            } else {
                form.appendChild(generalError);
            }
            continue;
        }
        const input = form.querySelector(`[name="${field}"], [id="${field}"]`); // Шукаємо по name або id
        if (input) {
            input.style.border = '1px solid red';
            const error = document.createElement('span');
            error.className = 'error-message';
            error.textContent = message;
            input.parentNode.insertBefore(error, input.nextSibling);
        } else {
            console.warn(`Input field not found for server error: ${field}`);
        }
    }
}


// Обробник нових повідомлень для script.js
if (socket) {
    socket.on('new_message', (messageData) => {
        if (currentUserId === null) { // Якщо користувач не авторизований, не показуємо сповіщення
            console.log("User not logged in, notification suppressed.");
            return;
        }
        // Переконуємося, що це не повідомлення поточного користувача
        // і що ми не на сторінці messages.html (для цього є chat_script.js)
        if (messageData.sender.id !== currentUserId && !window.location.pathname.endsWith('messages.html')) {
            showNotification(messageData);
        }
    });
}