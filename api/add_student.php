<?php
session_start(); 
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    exit;
}

file_put_contents('debug.log', 'Accessing add_student.php, Session: ' . print_r($_SESSION, true) . "\n", FILE_APPEND);

require_once __DIR__ . '/../controllers/student_control.php';
$input = json_decode(file_get_contents('php://input'), true);
$controller = new StudentController();
echo json_encode($controller->addStudent($input));
?>