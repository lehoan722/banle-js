<?php
$targetDir = "D:/THTVIETNAM/TigerHyperlink/Anh/HangHoa/"; // Thư mục lưu ảnh trên máy chủ

if (!file_exists($targetDir)) {
mkdir($targetDir, 0777, true);
}

$errors = array();
$success = array();

if (!empty($_FILES['imageFiles']['name'][0])) {
for ($i = 0; $i < count($_FILES['imageFiles']['name']); $i++) {
$name = $_FILES['imageFiles']['name'][$i];
$targetFile = $targetDir . basename($name);
$imageFileType = strtolower(pathinfo($targetFile, PATHINFO_EXTENSION));
$uploadOk = 1;

// Kiểm tra xem tệp tin có phải là hình ảnh hay không
$check = getimagesize($_FILES["imageFiles"]["tmp_name"][$i]);
if ($check === false) {
$errors[] = "Tệp tin $name không phải là hình ảnh.";
$uploadOk = 0;
}

// Kiểm tra xem tệp tin đã tồn tại hay chưa
//if (file_exists($targetFile)) {
//$errors[] = "Xin lỗi, tệp tin $name đã tồn tại.";
//$uploadOk = 0;
//}

// Giới hạn kích thước tệp tin (ví dụ: 5MB)
if ($_FILES["imageFiles"]["size"][$i] > 500000000) {
$errors[] = "Xin lỗi, tệp tin $name quá lớn.";
$uploadOk = 0;
}

// Chỉ cho phép một số định dạng tệp tin nhất định
if ($imageFileType != "jpg" && $imageFileType != "png" && $imageFileType != "jpeg" && $imageFileType != "gif") {
$errors[] = "Xin lỗi, chỉ cho phép các tệp tin JPG, JPEG, PNG & GIF cho tệp tin $name.";
$uploadOk = 0;
}

// Kiểm tra xem có lỗi xảy ra hay không
if ($uploadOk == 0) {
$errors[] = "Xin lỗi, tệp tin $name không được tải lên.";
} else {
if (move_uploaded_file($_FILES["imageFiles"]["tmp_name"][$i], $targetFile)) {
$success[] = "Tệp tin $name đã được tải lên thành công.";
} else {
$errors[] = "Xin lỗi, đã có lỗi xảy ra khi tải tệp tin $name lên.";
}
}
}
} else {
echo "Chưa chọn tệp tin nào để tải lên.";
}

if (!empty($errors)) {
echo "Đã xảy ra lỗi trong quá trình tải lên:<br>";
echo implode("<br>", $errors);
}

if (!empty($success)) {
echo "Các tệp tin đã được tải lên thành công:<br>";
echo implode("<br>", $success);
}
?>