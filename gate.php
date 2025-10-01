<?php
// /public_html/questions-site/gate.php

// ---- 1) حمّل ووردبريس بأمان (ابحث عن wp-load.php تلقائياً) ----
$max_levels = 5;
$base = __DIR__;
$wp_load = false;
for ($i = 0; $i <= $max_levels; $i++) {
    $candidate = $base . '/wp-load.php';
    if (is_file($candidate)) { $wp_load = $candidate; break; }
    $base = dirname($base);
}
if (!$wp_load) {
    http_response_code(500);
    exit('WP bootstrap not found. Check gate.php path.');
}
require_once $wp_load;

// ---- 2) فحص الدخول والعضوية ----
// 2.a: لازم يكون مسجّل دخول
if ( ! is_user_logged_in() ) {
    wp_redirect( home_url('/login/') );
    exit;
}

// 2.b: فحص اشتراك PMS (استخدم ID خطتك)
$plan_id = 1724;
$has_membership = true;

if ( function_exists('pms_is_member') ) {
    $has_membership = pms_is_member( get_current_user_id(), $plan_id );
}

// (اختياري) إن كنت تريد قبول "دور" معيّن بدل الخطة، ضعه هنا
// ملاحظة: مفتاح الدور (role key) يكون بشكل slug بدون مسافات وحروف صغيرة.
// مثالك يبدو كـ: al-subtain-university-of-medical-sciences-general-medicine
$role_slug_to_allow = 'al-subtain-university-of-medical-sciences-general-medicine';
// إذا تريد الاعتماد على الدور أيضًا، افتح التعليق التالي:
/*
$user = wp_get_current_user();
if ( ! in_array( $role_slug_to_allow, (array) $user->roles, true ) ) {
    $has_membership = false;
}
*/

if ( ! $has_membership ) {
    // صفحة الاشتراك الخاصة بـ PMS
    wp_redirect( home_url('/register/?subscription_plan=' . $plan_id) );
    exit;
}

// ---- 3) حدّد الملف المطلوب تقديمه ----
$docroot  = __DIR__;
$uri_path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );

// استخرج اسم الملف المقصود من نفس المجلد
$basename = basename( $uri_path );
if ($basename === '' || $basename === 'gate.php' || strpos($basename, '..') !== false) {
    $basename = 'index.html'; // الصفحة الرئيسية للموقع الفرعي
}

$filepath = realpath( $docroot . '/' . $basename );

// تأكد أن الملف موجود وداخل مجلد بنك الأسئلة
if ( ! $filepath || strpos($filepath, $docroot) !== 0 || ! is_file($filepath) ) {
    status_header(404);
    exit('Not found');
}

// ---- 4) أرسل النوع الصحيح ثم محتوى الملف ----
$ext  = strtolower( pathinfo($filepath, PATHINFO_EXTENSION) );
$mime = [
    'html'=>'text/html; charset=UTF-8', 'htm'=>'text/html; charset=UTF-8',
    'css'=>'text/css', 'js'=>'application/javascript',
    'png'=>'image/png', 'jpg'=>'image/jpeg', 'jpeg'=>'image/jpeg',
    'gif'=>'image/gif', 'svg'=>'image/svg+xml', 'webp'=>'image/webp',
    'json'=>'application/json', 'pdf'=>'application/pdf'
];
header('Content-Type: ' . ($mime[$ext] ?? 'application/octet-stream'));
readfile($filepath);
exit;
