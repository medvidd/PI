/* jshint esversion: 6 */

let currentPage = 1;
let totalPages = 1;
let selectedStudentIds = [];

document.addEventListener('DOMContentLoaded', async function () {
    console.log("Hello!");
    await checkLoginStatus();

    const notification = document.querySelector('.notification');
    const bell = document.querySelector('.bell');
    const notificationDot = document.querySelector('.notification-dot');

    if (notification) {
        notification.addEventListener('mouseenter', function () {
            notificationDot.classList.add('active');
        });
    }

    if (bell) {
        bell.addEventListener('click', function (e) {
            e.preventDefault();
            if (!localStorage.getItem('isLoggedIn')) {
                alert('Please log in to view messages.');
                return;
            }
            notificationDot.classList.remove('active');
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
            updateUIForLoggedInUser();
            if (document.getElementById('studentTable')) {
                loadStudents();
            }
        } else {
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('username');
            updateUIForLoggedOutUser();
            if (document.getElementById('studentTable')) {
                clearTable();
            }
        }
    } catch (error) {
        console.error('Error checking session:', error);
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('username');
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
    if (notification) notification.style.display = 'block';
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
    if (notification) notification.style.display = 'none';
    if (addButton) {
        addButton.style.cursor = 'not-allowed';
        addButton.disabled = true;
    }
}

if (document.getElementById('loginButton')) {
    document.getElementById('loginButton').addEventListener('click', function() {
        document.getElementById('modalLogin').style.display = 'flex';
    });
}

if (document.getElementById('closeLoginModal')) {
    document.getElementById('closeLoginModal').addEventListener('click', function() {
        document.getElementById('modalLogin').style.display = 'none';
        document.getElementById('loginForm').reset();
        document.getElementById('loginError').style.display = 'none';
    });
}

if (document.getElementById('cancelLoginBtn')) {
    document.getElementById('cancelLoginBtn').addEventListener('click', function() {
        document.getElementById('modalLogin').style.display = 'none';
        document.getElementById('loginForm').reset();
        document.getElementById('loginError').style.display = 'none';
    });
}

if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const loginError = document.getElementById('loginError');

        try {
            const response = await fetch('/PI/api/login.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (result.success) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', username);
                document.getElementById('modalLogin').style.display = 'none';
                document.getElementById('loginForm').reset();
                updateUIForLoggedInUser();
                if (document.getElementById('studentTable')) {
                    loadStudents();
                }
            } else {
                loginError.textContent = result.message;
                loginError.style.display = 'block';
            }
        } catch (error) {
            loginError.textContent = 'Error connecting to server';
            loginError.style.display = 'block';
        }
    });
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
                updateUIForLoggedOutUser();
                if (document.getElementById('studentTable')) {
                    clearTable();
                }
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

    loadStudents();

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
        const response = await fetch(`http://localhost/PI/api/get_students.php?page=${page}&t=${new Date().getTime()}`, {
            headers: { 'Cache-Control': 'no-cache' }
        });
        const result = await response.json();

        if (result.success) {
            console.log('Loaded students:', result.students);
            clearTable();
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
                        <button class="button-ed ${isChecked ? 'active' : 'disabled'}" aria-label="Edit student" title="Edit student" ${isChecked ? '' : 'disabled'}>
                            <i class="fa-solid fa-pen-to-square" data-id="${student.id}"></i>
                        </button>
                        <button class="button-ed ${isChecked ? 'active' : 'disabled'}" aria-label="Delete student" title="Delete student" ${isChecked ? '' : 'disabled'}>
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
        if (!/^[A-Za-zА-Яа-яҐґЄєІіЇї'\\-]{1,50}$/.test(value)) {
            isGood = false;
            errorMessage = 'Use only letters (English or Ukrainian), apostrophes, or hyphens (1-50 characters)';
        }
    } else if (field.id === 'gender' || field.id === 'editGender') {
        if (!['Male', 'Female'].includes(field.value)) {
            isGood = false;
            errorMessage = 'Gender must be Male or Female';
        }
    } else if (field.id === 'birthday' || field.id === 'editBirthday') {
        const inputDate = new Date(field.value);
        const currentDate = new Date();
        const year = inputDate.getFullYear();

        if (isNaN(inputDate.getTime())) {
            isGood = false;
            errorMessage = 'Invalid date format';
        } else if (inputDate > currentDate) {
            isGood = false;
            errorMessage = 'Date cannot be in the future';
        } else if (year < 1900 || year > currentDate.getFullYear()) {
            isGood = false;
            errorMessage = 'Year must be between 1900 and ' + currentDate.getFullYear();
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
    const fields = form.querySelectorAll('input, select');
    fields.forEach(field => {
        field.style.border = '1px solid #ddd';
        const error = field.nextElementSibling;
        if (error && error.classList.contains('error-message')) {
            error.remove();
        }
    });
}

function displayServerErrors(formId, errors) {
    clearFormErrors(formId);
    const form = document.getElementById(formId);
    for (const [field, message] of Object.entries(errors)) {
        if (field === 'general') {
            const generalError = document.createElement('span');
            generalError.className = 'error-message';
            generalError.textContent = message;
            form.appendChild(generalError);
            continue;
        }
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
            input.style.border = '1px solid red';
            const error = document.createElement('span');
            error.className = 'error-message';
            error.textContent = message;
            input.parentNode.insertBefore(error, input.nextSibling);
        }
    }
}

function logStudentsData() {
    const students = [];
    const table = document.getElementById('studentTable');
    if (!table) return;
    const rows = table.getElementsByTagName('tr');

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].cells;
        const statusIcon = cells[5].querySelector('.fa-circle');
        const student = {
            id: parseInt(cells[7].textContent),
            group: cells[1].textContent,
            name: cells[2].textContent,
            gender: cells[3].textContent,
            birthday: cells[4].textContent,
            status: statusIcon.classList.contains('status-active') ? 'Active' : 'Inactive'
        };
        students.push(student);
    }
    
    console.log(JSON.stringify(students, null, 2));
}