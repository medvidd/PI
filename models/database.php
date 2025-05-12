<?php
require_once __DIR__ . '/../config/config.php';

class Database {
    private $conn;

    public function __construct() {
        $this->conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($this->conn->connect_error) {
            die("Database connection failed: " . $this->conn->connect_error);
        }
        $this->conn->set_charset('utf8mb4');
    }

    public function getConnection() {
        return $this->conn;
    }

    public function closeConnection() {
        $this->conn->close();
    }
}
?>