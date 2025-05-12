<?php
// Налаштування заголовків
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Запускаємо сесію
session_start();

// Очищаємо всі дані сесії
session_unset();
session_destroy();

// Повертаємо успішну відповідь
echo json_encode(['success' => true, 'message' => 'Logged out successfully']);
?>