document.getElementById('addbutton').addEventListener('click', function() 
{
    document.getElementById('modal').style.display = 'flex';
});

document.getElementById('closeModal').addEventListener('click', function() 
{
    document.getElementById('modal').style.display = 'none';
});

document.getElementById('cancelBtn').addEventListener('click', function() 
{
    document.getElementById('modal').style.display = 'none';
});

const table = document.getElementById('studentTable');
const selectAllCheckbox = document.getElementById('selectAll');

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

document.getElementById('createBtn').addEventListener('click', function() 
{
    const group = document.getElementById('group').value;
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const gender = document.getElementById('gender').value;
    const birthday = document.getElementById('birthday').value;

    if (!group || !firstName || !lastName || !gender || !birthday) {
        alert('Please fill in all fields.');
        return;
    }

    const table = document.getElementById('studentTable');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="checkbox" class="rowCheck"></td>
        <td>${group}</td>
        <td>${firstName} ${lastName}</td>
        <td>${gender}</td>
        <td>${birthday}</td>
        <td><i class="fa-solid fa-circle"></i></td>
        <td>
            <button class="button-ed disabled" title="Edit student" disabled><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="button-ed disabled" title="Delete student" disabled><i class="fa-solid fa-trash"></i></button>
        </td>
    `;

    table.appendChild(row);

    document.getElementById('modal').style.display = 'none';
    document.getElementById('studentForm').reset();
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
        };
    } else if (target.querySelector('.fa-pen-to-square')) {
        // Відкриваємо модальне вікно для редагування
        const editModal = document.getElementById('modalEdit');
        editModal.style.display = 'flex';

        // Заповнюємо поля даними з рядка
        document.getElementById('editGroup').value = row.cells[1].textContent;
        document.getElementById('editFirstName').value = firstName;
        document.getElementById('editLastName').value = lastName;
        document.getElementById('editGender').value = row.cells[3].textContent;
        document.getElementById('editBirthday').value = row.cells[4].textContent;

        // Закриття модального вікна
        document.getElementById('closeEditModal').onclick = function() {
            editModal.style.display = 'none';
        };

        document.getElementById('cancelEditBtn').onclick = function() {
            editModal.style.display = 'none';
        };
    }
});

document.addEventListener('DOMContentLoaded', function () {
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