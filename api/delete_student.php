<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    exit;
}

require_once __DIR__ . '/../controllers/student_control.php';
$input = json_decode(file_get_contents('php://input'), true);
$controller = new StudentController();
echo json_encode($controller->deleteStudent($input['id']));
?>