export const WORKOUT_PLANS = [
  {
    id: 1,
    name: 'Push Day',
    nameVi: 'Ngày Đẩy',
    days: 'Thứ 2 / Thứ 5',
    tag: 'Ngực · Vai · Tay sau',
    color: 'rgba(200,255,87,0.1)',
    borderColor: 'rgba(200,255,87,0.25)',
    emoji: '💪',
    duration: '~55 phút',
    exercises: [
      {
        id: 'e1',
        name: 'Bench Press',
        nameVi: 'Đẩy tạ ngang',
        sets: [
          { weight: 60, reps: 10 },
          { weight: 70, reps: 8 },
          { weight: 75, reps: 6 },
        ],
      },
      {
        id: 'e2',
        name: 'Overhead Press',
        nameVi: 'Đẩy tạ trên đầu',
        sets: [
          { weight: 40, reps: 10 },
          { weight: 45, reps: 8 },
          { weight: 50, reps: 6 },
        ],
      },
      {
        id: 'e3',
        name: 'Tricep Dips',
        nameVi: 'Chống đẩy hẹp',
        sets: [
          { weight: 0, reps: 12 },
          { weight: 0, reps: 12 },
          { weight: 0, reps: 10 },
        ],
      },
      {
        id: 'e3b',
        name: 'Incline Dumbbell Press',
        nameVi: 'Đẩy tạ đôi nghiêng',
        sets: [
          { weight: 22, reps: 12 },
          { weight: 24, reps: 10 },
          { weight: 26, reps: 8 },
        ],
      },
      {
        id: 'e3c',
        name: 'Lateral Raise',
        nameVi: 'Nâng tạ ngang',
        sets: [
          { weight: 10, reps: 15 },
          { weight: 10, reps: 15 },
          { weight: 12, reps: 12 },
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'Pull Day',
    nameVi: 'Ngày Kéo',
    days: 'Thứ 3 / Thứ 6',
    tag: 'Lưng · Tay trước',
    color: 'rgba(255,184,71,0.1)',
    borderColor: 'rgba(255,184,71,0.25)',
    emoji: '🏋️',
    duration: '~52 phút',
    exercises: [
      {
        id: 'e4',
        name: 'Pull-Ups',
        nameVi: 'Kéo xà',
        sets: [
          { weight: 0, reps: 8 },
          { weight: 0, reps: 8 },
          { weight: 0, reps: 6 },
        ],
      },
      {
        id: 'e5',
        name: 'Barbell Row',
        nameVi: 'Kéo tạ đòn',
        sets: [
          { weight: 60, reps: 10 },
          { weight: 65, reps: 8 },
          { weight: 70, reps: 6 },
        ],
      },
      {
        id: 'e6',
        name: 'Hammer Curl',
        nameVi: 'Curl tạ búa',
        sets: [
          { weight: 16, reps: 12 },
          { weight: 18, reps: 10 },
          { weight: 18, reps: 10 },
        ],
      },
      {
        id: 'e6b',
        name: 'Face Pull',
        nameVi: 'Kéo mặt dây cáp',
        sets: [
          { weight: 20, reps: 15 },
          { weight: 22, reps: 15 },
          { weight: 22, reps: 12 },
        ],
      },
      {
        id: 'e6c',
        name: 'Barbell Curl',
        nameVi: 'Curl tạ đòn',
        sets: [
          { weight: 30, reps: 12 },
          { weight: 35, reps: 10 },
          { weight: 35, reps: 8 },
        ],
      },
    ],
  },
  {
    id: 3,
    name: 'Leg Day',
    nameVi: 'Ngày Chân',
    days: 'Thứ 4 / Thứ 7',
    tag: 'Đùi trước · Đùi sau · Mông',
    color: 'rgba(255,87,87,0.1)',
    borderColor: 'rgba(255,87,87,0.25)',
    emoji: '🦵',
    duration: '~55 phút',
    exercises: [
      {
        id: 'e7',
        name: 'Squat',
        nameVi: 'Squat',
        sets: [
          { weight: 80, reps: 10 },
          { weight: 90, reps: 8 },
          { weight: 100, reps: 6 },
        ],
      },
      {
        id: 'e8',
        name: 'Romanian Deadlift',
        nameVi: 'Deadlift Romania',
        sets: [
          { weight: 60, reps: 12 },
          { weight: 70, reps: 10 },
          { weight: 75, reps: 8 },
        ],
      },
      {
        id: 'e9',
        name: 'Leg Press',
        nameVi: 'Đạp chân máy',
        sets: [
          { weight: 120, reps: 12 },
          { weight: 140, reps: 10 },
          { weight: 150, reps: 10 },
        ],
      },
      {
        id: 'e9b',
        name: 'Leg Curl',
        nameVi: 'Curl chân máy',
        sets: [
          { weight: 40, reps: 12 },
          { weight: 45, reps: 12 },
          { weight: 50, reps: 10 },
        ],
      },
      {
        id: 'e9c',
        name: 'Calf Raise',
        nameVi: 'Nâng gót',
        sets: [
          { weight: 60, reps: 20 },
          { weight: 60, reps: 20 },
          { weight: 70, reps: 15 },
        ],
      },
    ],
  },
];

export const WEEKLY_DATA = [
  { day: 'T2', sets: 45, date: '24/3' },
  { day: 'T3', sets: 0, date: '25/3' },
  { day: 'T4', sets: 62, date: '26/3' },
  { day: 'T5', sets: 38, date: '27/3' },
  { day: 'T6', sets: 0, date: '28/3' },
  { day: 'T7', sets: 71, date: '29/3' },
  { day: 'CN', sets: 55, date: '30/3' },
];

export const WORKOUT_HISTORY = [
  { id: 1, date: 'Hôm nay', name: 'Ngày Đẩy', sets: 9, volume: '4,200 kg', duration: '48 phút', color: '#C8FF57' },
  { id: 2, date: '29/3', name: 'Ngày Chân', sets: 9, volume: '6,800 kg', duration: '55 phút', color: '#FFB847' },
  { id: 3, date: '26/3', name: 'Ngày Kéo', sets: 9, volume: '3,100 kg', duration: '42 phút', color: '#C8FF57' },
  { id: 4, date: '24/3', name: 'Ngày Đẩy', sets: 8, volume: '3,900 kg', duration: '44 phút', color: '#FFB847' },
  { id: 5, date: '22/3', name: 'Ngày Chân', sets: 9, volume: '6,500 kg', duration: '52 phút', color: '#FF5757' },
];
