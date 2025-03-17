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
        <td><i class="fa-solid fa-circle" style="color: #d6d6d6;"></i></td>
        <td>
            <button title="Edit student"><i class="fa-solid fa-pen-to-square" style="color:rgb(143, 191, 218); cursor:none;"></i></button>
            <button title="Delete student"><i class="fa-solid fa-trash" style="color: rgb(143, 191, 218); cursor:none;"></i></button>
        </td>
    `;

    table.appendChild(row);

    document.getElementById('modal').style.display = 'none';
    document.getElementById('studentForm').reset();
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