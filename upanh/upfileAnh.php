<?php
$targetDir = "D:/THTVIETNAM/TigerHyperlink/Anh/HangHoa/"; // Thư mục lưu ảnh trên máy chủ
if (!file_exists($targetDir)) {
mkdir($targetDir, 0777, true);
}

$errors = array();
$success = array();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
if (isset($_FILES['files'])) {
// Xử lý tải lên tệp tin
if (!empty($_FILES['files']['name'][0])) {
for ($i = 0; $i < count($_FILES['files']['name']); $i++) {
$name = $_FILES['files']['name'][$i];
$targetFile = $targetDir . basename($name);
$uploadOk = 1;

// Kiểm tra xem tệp tin đã tồn tại hay chưa
if (file_exists($targetFile)) {
$errors[] = "Xin lỗi, tệp tin $name đã tồn tại.";
$uploadOk = 0;
}

// Giới hạn kích thước tệp tin (ví dụ: 50MB)
if ($_FILES["files"]["size"][$i] > 50000000) {
$errors[] = "Xin lỗi, tệp tin $name quá lớn.";
$uploadOk = 0;
}

// Kiểm tra xem có lỗi xảy ra hay không
if ($uploadOk == 0) {
$errors[] = "Xin lỗi, tệp tin $name không được tải lên.";
} else {
if (move_uploaded_file($_FILES["files"]["tmp_name"][$i], $targetFile)) {
$success[] = "Tệp tin $name đã được tải lên thành công.";
} else {
$errors[] = "Xin lỗi, đã có lỗi xảy ra khi tải tệp tin $name lên.";
}
}
}
} else {
$errors[] = "Chưa chọn tệp tin nào để tải lên.";
}
} elseif (isset($_POST['deleteFile'])) {
// Xử lý xóa tệp tin
$fileToDelete = $targetDir . basename($_POST['deleteFile']);
if (file_exists($fileToDelete)) {
if (unlink($fileToDelete)) {
$success[] = "Tệp tin " . basename($_POST['deleteFile']) . " đã được xóa.";
} else {
$errors[] = "Không thể xóa tệp tin " . basename($_POST['deleteFile']) . ".";
}
} else {
$errors[] = "Tệp tin " . basename($_POST['deleteFile']) . " không tồn tại.";
}
}
}

// Hiển thị danh sách tệp tin
$files = array_diff(scandir($targetDir), array('.', '..'));
?>

<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quản lý tệp tin</title>
<style>
body {
font-family: Arial, sans-serif;
}
.upload-form, .file-list {
margin: 20px 0;
text-align: center;
}
.file-list table {
margin: 0 auto;
border-collapse: collapse;
width: 80%;
}
.file-list th, .file-list td {
border: 1px solid #ddd;
padding: 8px;
}
.file-list th {
background-color: #f2f2f2;
}
</style>
</head>
<body>
<h1>Quản lý tệp tin</h1>

<!-- Form upload file -->
<div class="upload-form">
<form id="uploadForm" enctype="multipart/form-data" method="POST">
<input type="file" id="files" name="files[]" multiple>
<button type="submit">Tải lên</button>
</form>
</div>

<?php
if (!empty($errors)) {
echo "Đã xảy ra lỗi trong quá trình xử lý:<br>";
echo implode("<br>", $errors);
}

if (!empty($success)) {
echo "Thành công:<br>";
echo implode("<br>", $success);
}
?>

<!-- Danh sách tệp tin -->
<div class="file-list">
<h2>Danh sách tệp tin</h2>
<table>
<thead>
<tr>
<th>Tên tệp tin</th>
<th>Kích thước</th>
<th>Hành động</th>
</tr>
</thead>
<tbody>
<?php foreach ($files as $file): ?>
<tr>
<td><?php echo htmlspecialchars($file); ?></td>
<td><?php echo filesize($targetDir . $file); ?> bytes</td>
<td>
<a href="<?php echo "a/" . htmlspecialchars($file); ?>" download>Tải về</a>
<form method="POST" style="display:inline;">
<input type="hidden" name="deleteFile" value="<?php echo htmlspecialchars($file); ?>">
<button type="submit">Xóa</button>
</form>
</td>
</tr>
<?php endforeach; ?>
</tbody>
</table>
</div>
</body>
</html>