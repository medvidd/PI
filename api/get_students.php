<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

file_put_contents('debug.log', 'Accessing get_students.php, REQUEST_URI: ' . $_SERVER['REQUEST_URI'] . "\n", FILE_APPEND);

require_once __DIR__ . '/../controllers/student_control.php';
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$controller = new StudentController();
echo json_encode($controller->getStudents($page));
?>