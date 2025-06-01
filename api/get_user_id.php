<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../controllers/auth_control.php';
require_once __DIR__ . '/../models/user.php';

session_start();

if (!isset($_SESSION['user'])) {
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$user = new User();
$userId = $user->getUserIdByUsername($_SESSION['user']);

if ($userId) {
    echo json_encode(['success' => true, 'userId' => $userId]);
} else {
    echo json_encode(['success' => false, 'message' => 'User not found']);
}
?> 