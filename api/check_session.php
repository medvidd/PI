<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../controllers/auth_control.php';
$controller = new AuthController();
echo json_encode($controller->checkSession());
?>