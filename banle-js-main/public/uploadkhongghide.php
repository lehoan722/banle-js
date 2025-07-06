<?php
$targetDir = "D:/THTVIETNAM/TigerHyperlink/Anh/HangHoa/";
if (!file_exists($targetDir)) {
    mkdir($targetDir, 0777, true);
}

$errors = array();
$success = array();
$skipped = array();

// Lấy danh sách file đã có trong thư mục, chuẩn hóa lowercase
$existing_files = array_map('strtolower', scandir($targetDir));

// Kiểm tra nếu có file được chọn
if (!empty($_FILES['imageFiles']['name'][0])) {
    for ($i = 0; $i < count($_FILES['imageFiles']['name']); $i++) {
        $name = $_FILES['imageFiles']['name'][$i];
        $name_lc = strtolower($name);
        $targetFile = $targetDir . basename($name);
        $imageFileType = strtolower(pathinfo($targetFile, PATHINFO_EXTENSION));
        $uploadOk = 1;

        // Kiểm tra có phải ảnh không
        $check = getimagesize($_FILES["imageFiles"]["tmp_name"][$i]);
        if ($check === false) {
            $errors[] = "Tệp $name không phải là hình ảnh.";
            continue;
        }

        // Kiểm tra dung lượng
        if ($_FILES["imageFiles"]["size"][$i] > 500000000) {
            $errors[] = "Tệp $name quá lớn.";
            continue;
        }

        // Kiểm tra định dạng
        if (!in_array($imageFileType, array("jpg", "jpeg", "png", "gif"))) {
            $errors[] = "Tệp $name không đúng định dạng JPG, JPEG, PNG, GIF.";
            continue;
        }

        // Kiểm tra trùng tên file (không phân biệt hoa thường)
        if (in_array($name_lc, $existing_files)) {
            $skipped[] = $name;
            continue;
        }

        // Tiến hành upload nếu file chưa tồn tại
        if (move_uploaded_file($_FILES["imageFiles"]["tmp_name"][$i], $targetFile)) {
            $success[] = $name;
        } else {
            $errors[] = "Lỗi khi tải tệp $name.";
        }
    }
} else {
    echo "Chưa chọn tệp nào để tải lên.";
}

// Thông báo kết quả
if (!empty($success)) {
    echo "Các tệp tin đã được tải lên thành công:<br>";
    echo implode("<br>", $success) . "<br><br>";
}

if (!empty($skipped)) {
    echo "Các tệp tin đã bị bỏ qua do đã tồn tại:<br>";
    echo implode("<br>", $skipped) . "<br><br>";
}

if (!empty($errors)) {
    echo "Các lỗi đã xảy ra:<br>";
    echo implode("<br>", $errors);
}
?>
