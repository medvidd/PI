<?php
// Налаштування заголовків
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Запускаємо сесію
session_start();

// Перевіряємо, чи є активна сесія
if (isset($_SESSION['user'])) {
    echo json_encode(['success' => true, 'username' => $_SESSION['user']]);
} else {
    echo json_encode(['success' => false, 'message' => 'Not logged in']);
}
?>