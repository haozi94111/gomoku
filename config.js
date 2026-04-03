// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyBd9hPdhjOdRJvCqwHzTqBPjVSkE538WxI",
    authDomain: "gomoku-24483.firebaseapp.com",
    databaseURL: "https://gomoku-24483-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "gomoku-24483",
    storageBucket: "gomoku-24483.firebasestorage.app",
    messagingSenderId: "109906009073",
    appId: "1:109906009073:web:17fffa92593e8cfb020250"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
