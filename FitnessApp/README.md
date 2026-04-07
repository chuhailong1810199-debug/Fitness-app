# 🏋️ FitnessApp - Ứng dụng theo dõi tập luyện

Ứng dụng React Native (Expo) theo dõi tập gym với đầy đủ tính năng.

---

## 📁 Cấu trúc dự án

```
FitnessApp/
├── App.js                          # Entry point, cấu hình navigation
├── package.json
├── babel.config.js
└── src/
    ├── theme/
    │   └── colors.js               # Màu sắc toàn app
    ├── data/
    │   └── workoutData.js          # Dữ liệu bài tập mẫu
    ├── components/
    │   └── UI.js                   # Components dùng chung (Card, Button...)
    └── screens/
        ├── HomeScreen.js           # 🏠 Trang chủ
        ├── PlansScreen.js          # 📋 Kế hoạch tập
        ├── WorkoutScreen.js        # ⚡ Tập luyện (log set/rep)
        ├── TimerScreen.js          # ⏱ Hẹn giờ nghỉ
        └── ProgressScreen.js       # 📈 Tiến độ & lịch sử
```

---

## 🚀 Hướng dẫn cài đặt

### Bước 1: Cài đặt Node.js và Expo CLI
```bash
# Cài Node.js từ https://nodejs.org (phiên bản LTS)
npm install -g expo-cli
```

### Bước 2: Di chuyển vào thư mục dự án
```bash
cd FitnessApp
```

### Bước 3: Cài đặt dependencies
```bash
npm install
```

### Bước 4: Chạy ứng dụng
```bash
npx expo start
```

Sau đó:
- Quét mã QR bằng ứng dụng **Expo Go** trên điện thoại (iOS/Android)
- Hoặc nhấn `a` để mở Android Emulator
- Hoặc nhấn `i` để mở iOS Simulator

---

## 📱 Màn hình & tính năng

| Màn hình | Tính năng |
|----------|-----------|
| 🏠 Trang chủ | Thống kê tuần, biểu đồ khối lượng, kế hoạch hôm nay |
| 📋 Kế hoạch | 3 chương trình Push/Pull/Leg, tips tập luyện |
| ⚡ Tập luyện | Log set/rep, nhập cân nặng, đánh dấu hoàn thành |
| ⏱ Hẹn giờ | Đồng hồ vòng tròn, 4 preset (30/60/90/120s) |
| 📈 Tiến độ | Thống kê tổng, kỷ lục cá nhân, nhật ký tập |

---

## 🛠 Các bước nâng cấp tiếp theo

1. **Lưu dữ liệu thật** — thay dữ liệu mẫu bằng `AsyncStorage`:
   ```js
   import AsyncStorage from '@react-native-async-storage/async-storage';
   await AsyncStorage.setItem('workoutLog', JSON.stringify(data));
   ```

2. **Thêm bài tập tùy chỉnh** — form thêm/sửa exercise

3. **Thông báo** — nhắc nhở lịch tập bằng `expo-notifications`

4. **Đồng bộ đám mây** — Firebase hoặc Supabase

5. **Biểu đồ nâng cao** — dùng thư viện `victory-native`

---

## 📦 Dependencies chính

| Package | Công dụng |
|---------|-----------|
| `expo` | Framework React Native |
| `@react-navigation/bottom-tabs` | Tab navigation phía dưới |
| `@react-navigation/native-stack` | Stack navigation |
| `react-native-svg` | Đồng hồ hẹn giờ dạng vòng tròn |
| `react-native-safe-area-context` | Xử lý notch/home indicator |
| `@react-native-async-storage/async-storage` | Lưu dữ liệu cục bộ |
