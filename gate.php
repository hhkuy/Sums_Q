<?php
// gate.php

// ضُمّن ووردبريس (عدّل المسار إذا مجلدك داخل public_html/)
require_once __DIR__ . '/../wp-load.php';

// تحقق من تسجيل الدخول و الاشتراك
if ( !is_user_logged_in() ) {
    wp_redirect( home_url('/login/') ); exit;
}
if ( function_exists('pms_is_member') && !pms_is_member(get_current_user_id(), 1724) ) {
    wp_redirect( home_url('/register/?subscription_plan=1724') ); exit;
}

// جلب الملف المطلوب
$docroot   = __DIR__;
$request   = $_SERVER['REQUEST_URI'] ?? '/';
$basename  = basename(parse_url($request, PHP_URL_PATH));

if ($basename === '' || $basename === 'gate.php' || strpos($basename, '..') !== false) {
    $basename = 'index.html';
}

$filepath = realpath($docroot . '/' . $basename);
if (!$filepath || strpos($filepath, $docroot) !== 0 || !is_file($filepath)) {
    status_header(404); echo 'Not found'; exit;
}

$ext = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));
$mime = [
    'html'=>'text/html; charset=UTF-8','htm'=>'text/html; charset=UTF-8',
    'css'=>'text/css','js'=>'application/javascript','png'=>'image/png',
    'jpg'=>'image/jpeg','jpeg'=>'image/jpeg','svg'=>'image/svg+xml','gif'=>'image/gif'
];
header('Content-Type: ' . ($mime[$ext] ?? 'application/octet-stream'));
readfile($filepath);
exit;
