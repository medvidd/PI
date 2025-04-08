/* jshint esversion: 6 */

if ("serviceWorker" in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register("/PI/sw.js")
            .then((reg) => console.log("Service Worker registered with scope:", reg.scope))
            .catch((err) => console.error("Service Worker registration failed:", err));
    });
}

document.getElementById('addbutton').addEventListener('click', function() 
{
    document.getElementById('modal').style.display = 'flex';
});

document.getElementById('closeModal').addEventListener('click', function() 
{
    document.getElementById('modal').style.display = 'none';
    document.getElementById('studentForm').reset();
});

document.getElementById('cancelBtn').addEventListener('click', function() 
{
    document.getElementById('modal').style.display = 'none';
    document.getElementById('studentForm').reset();
});

const table = document.getElementById('studentTable');
const selectAllCheckbox = document.getElementById('selectAll');
let studentIdCounter = 1;

function updateRowButtons(row, isChecked) {
    const buttons = row.querySelectorAll('.button-ed');
    buttons.forEach(button => {
        if (isChecked) {
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

selectAllCheckbox.addEventListener('change', function() {
    const checkboxes = table.querySelectorAll('.rowCheck');
    checkboxes.forEach(checkbox => {
        checkbox.checked = this.checked;
        const row = checkbox.closest('tr');
        updateRowButtons(row, this.checked);
    });
});

function checkField(field) {
    let isGood = true;
    let errorMessage = '';

    if (field.value === "") {
        isGood = false;
        errorMessage = 'This field cannot be empty';
    }
    else if ((field.id === 'firstName' || field.id === 'lastName' || 
              field.id === 'editFirstName' || field.id === 'editLastName')) {
        const value = field.value;
        
        if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
            if (/^\.[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value))
            {
                alert("You can't use . at the start of email");
            }
            else if (/^[a-zA-Z0-9._%+-]+@lpnu\.ua$/.test(value)) {
                console.log("Politechnic");
                alert("Привіт, друже Політехніку!");
            }
            isGood = false;
            errorMessage = 'Please enter a name, not an email address';
        }
        else if (!/^[A-Za-zА-Яа-яҐґЄєІіЇї'\-]+$/.test(value)) {
            isGood = false;
            errorMessage = 'Use only letters (English or Ukrainian), apostrophes, or hyphens';
        }
        else if (value.length < 2 || value.length > 30) {
            isGood = false;
            errorMessage = 'Must be between 2 and 30 characters';
        }
        else if (!/^[A-ZА-ЯҐЄІЇ][a-zа-яґєії']+(-[A-ZА-ЯҐЄІЇ][a-zа-яґєії']+)?$/.test(value)) {
            isGood = false;
            errorMessage = 'Use format: Name or Name-Name (first letter capitalized)';
        }
    }
    else if ((field.id === 'birthday' || field.id === 'editBirthday') && field.value !== "") {
        const inputDate = new Date(field.value);
        const currentDate = new Date();
        const year = inputDate.getFullYear();

        if (inputDate > currentDate) {
            isGood = false;
            errorMessage = 'Date cannot be in the future';
        }
        else if (year < 1900 || year > currentDate.getFullYear()) {
            isGood = false;
            errorMessage = 'Year must be between 1900 and ' + currentDate.getFullYear();
        }
    }

    if (!isGood) {
        field.style.border = "1px solid red";
        let error = field.nextElementSibling;
        if (!error || !error.classList.contains('error-message')) {
            error = document.createElement('span');
            error.className = 'error-message';
            field.parentNode.insertBefore(error, field.nextSibling);
        }
        error.textContent = errorMessage;
    } else {
        field.style.border = "1px solid #ddd";
        let error = field.nextElementSibling;
        if (error && error.classList.contains('error-message')) {
            error.remove();
        }
    }
    return isGood;
}

document.getElementById('studentForm').addEventListener('submit', function(e) {
    e.preventDefault(); 
    
    const group = document.getElementById('group');
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    const gender = document.getElementById('gender');
    const birthday = document.getElementById('birthday');

    const table = document.getElementById('studentTable');
    const row = document.createElement('tr');
    const studentId = studentIdCounter++;
    
    row.innerHTML = `
        <td><input type="checkbox" class="rowCheck" title="Select student"></td>
        <td>${group.value}</td>
        <td>${firstName.value} ${lastName.value}</td>
        <td>${gender.value}</td>
        <td>${birthday.value}</td>
        <td><i class="fa-solid fa-circle"></i></td>
        <td>
            <button class="button-ed disabled" arial-label="Edit student" title="Edit student" disabled><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="button-ed disabled" arial-label="Delete student" title="Delete student" disabled><i class="fa-solid fa-trash"></i></button>
        </td>
        <td style="display: none;">${studentId}</td>
    `;

    table.appendChild(row);
    document.getElementById('modal').style.display = 'none';
    this.reset();
    logStudentsData();
});

table.addEventListener('change', function(e) {
    if (e.target.classList.contains('rowCheck')) {
        const row = e.target.closest('tr');
        updateRowButtons(row, e.target.checked);
        
        const allCheckboxes = table.querySelectorAll('.rowCheck');
        const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
    }
});

table.addEventListener('click', function(e) {
    const target = e.target.closest('button');
    if (!target || target.classList.contains('disabled')) return;

    const row = target.closest('tr');
    const nameCell = row.cells[2].textContent;
    const [firstName, lastName] = nameCell.split(' ');

    if (target.querySelector('.fa-trash')) {
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

        document.getElementById('confirmDelBtn').onclick = function() {
            row.remove();
            deleteModal.style.display = 'none';
            logStudentsData();
        };
    } 
    else if (target.querySelector('.fa-pen-to-square')) {
        const editModal = document.getElementById('modalEdit');
        editModal.style.display = 'flex';

        document.getElementById('editGroup').value = row.cells[1].textContent;
        document.getElementById('editFirstName').value = firstName;
        document.getElementById('editLastName').value = lastName;
        document.getElementById('editGender').value = row.cells[3].textContent;
        document.getElementById('editBirthday').value = row.cells[4].textContent;

        editModal.dataset.editingRow = row.rowIndex;
        editModal.dataset.studentId = row.cells[7].textContent;

        document.getElementById('closeEditModal').onclick = function() {
            editModal.style.display = 'none';
        };

        document.getElementById('cancelEditBtn').onclick = function() {
            editModal.style.display = 'none';
        };
    }
});

document.getElementById('saveEditBtn').addEventListener('click', function() {
    let group = document.getElementById('editGroup');
    let firstName = document.getElementById('editFirstName');
    let lastName = document.getElementById('editLastName');
    let gender = document.getElementById('editGender');
    let birthday = document.getElementById('editBirthday');

    let allFieldsAreGood = checkField(group) && checkField(firstName) && 
                          checkField(lastName) && checkField(gender) && 
                          checkField(birthday);

    if (allFieldsAreGood) {
        const editModal = document.getElementById('modalEdit');
        const rowIndex = editModal.dataset.editingRow;
        const row = table.rows[rowIndex];

        row.cells[1].textContent = group.value;
        row.cells[2].textContent = `${firstName.value} ${lastName.value}`;
        row.cells[3].textContent = gender.value;
        row.cells[4].textContent = birthday.value;

        document.getElementById('modalEdit').style.display = 'none';

        logStudentsData();
    }
});

document.addEventListener('DOMContentLoaded', function () {
    console.log("Hello!")
    loadStudentsFromStorage();

    const notification = document.querySelector('.notification');
    const bell = document.querySelector('.bell');
    const notificationDot = document.querySelector('.notification-dot');

    notification.addEventListener('mouseenter', function () {
        notificationDot.classList.add('active');
    });

    bell.addEventListener('click', function (e) {
        e.preventDefault(); 
        notificationDot.classList.remove('active');

        setTimeout(function () {
            window.location.href = 'messages.html';
        }, 300);
    });
});

function logStudentsData() {
    const students = [];
    const rows = table.getElementsByTagName('tr');

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].cells;
        const student = {
            id: parseInt(cells[7].textContent),
            group: cells[1].textContent,
            name: cells[2].textContent,
            gender: cells[3].textContent,
            birthday: cells[4].textContent,
            status: cells[5].innerHTML.includes('fa-circle') ? 'Active' : 'Inactive'
        };
        students.push(student);
    }
    
    console.log(JSON.stringify(students, null, 2));
    localStorage.setItem('students', JSON.stringify(students));
}

function loadStudentsFromStorage() {
    const storedStudents = localStorage.getItem('students');
    if (storedStudents) {
        const students = JSON.parse(storedStudents);
        students.forEach(student => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="checkbox" class="rowCheck" title="Select student"></td>
                <td>${student.group}</td>
                <td>${student.name}</td>
                <td>${student.gender}</td>
                <td>${student.birthday}</td>
                <td><i class="fa-solid fa-circle"></i></td>
                <td>
                    <button class="button-ed disabled" aria-label="Edit student" title="Edit student" disabled><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="button-ed disabled" aria-label="Delete student" title="Delete student" disabled><i class="fa-solid fa-trash"></i></button>
                </td>
                <td style="display: none;">${student.id}</td>
            `;
            table.appendChild(row);
            studentIdCounter = Math.max(studentIdCounter, student.id + 1);
        });
    }
}