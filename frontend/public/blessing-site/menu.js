// Blessings menu, transcribed from "Restaurant menu.pdf" (Online Menu 2026), in the same order as the PDF.
// Item: [name, price, price2?, special?]. A group with `cols` has two prices per item (null = no price printed).
// Spelling is corrected; prices are exactly as printed. To change a price or add a dish, edit this file only.
const MENU = [
  {
    id: 'coffee', name: 'Coffee', blurb: 'Best seller',
    groups: [{ items: [
      ['Cappuccino', 99], ['Cafe Latte', 119], ['Espresso', 49], ['Cafe Mocha', 109], ['Hot Chocolate', 119],
      ['Cortado', 89], ['Americano', 79], ['Macchiato', 99], ['Hot Spanish Coffee', 109], ['Iced Coffee', 149],
      ['Cold Spanish Coffee', 129], ['Pistachio Coffee', 159], ['Signature Coffee', 119], ['Frappuccino', 159], ['Flat White Coffee', 109],
    ] }],
  },
  {
    id: 'tea', name: 'Tea',
    groups: [{ items: [
      ['Tea', 29], ['Masala Tea', 39], ['Rose Tea', 45], ['Tandoori Tea', 45], ['Irani Tea', 45],
      ['Mint Tea', 39], ['Green Tea', 39], ['Kesar Tea', 89], ['Pineapple Tea', 49], ['Lemon Tea', 39],
    ] }],
  },
  {
    id: 'drinks', name: 'Beverages & Shakes', blurb: 'Beverages, shakes, mocktails and lassi',
    groups: [
      { title: 'Beverages', items: [
        ['Cold Drink', 49], ['Lemon Soda', 89], ['Soda', 39], ['Cold Coffee', 129], ['Mineral Water', 'MRP'], ['Butter Milk', 69],
      ] },
      { title: 'Shakes', items: [
        ['Chocolate Shake', 149], ['Vanilla Shake', 129], ['Oreo Shake', 159], ['KitKat Shake', 159],
        ['Choco Blast Shake', 199], ['Strawberry Shake', 149], ['Mango Shake', 139],
      ] },
      { title: 'Mocktails', items: [
        ['Signature Blessings', 159, null, true], ['Pineapple', 139], ['Strawberry', 129], ['Mango', 149],
        ['Rose', 149], ['Blueberry', 145], ['Green Apple', 119], ['Virgin Mojito', 109],
      ] },
      { title: 'Lassi', items: [['Lassi', 79], ['Nuts Lassi', 89], ['Fruit Lassi', 99]] },
    ],
  },
  {
    id: 'desserts', name: 'Ice Cream & Desserts', blurb: 'Made with love',
    groups: [
      { title: 'Ice Cream', items: [['Chocolate', 89], ['Vanilla', 79], ['Strawberry', 69], ['Butterscotch', 89], ['Tutti Frutti', 99]] },
      { title: 'Desserts', items: [
        ['Motichoor Laddu', 35], ['Fried Ice Cream', 69, null, true], ['Gulab Jamun', 19], ['Rasmalai', 50],
        ['Brownie', 60], ['Brownie Sizzler', 129, null, true], ['Choco Lava', 99],
      ] },
    ],
  },
  {
    id: 'snacks', name: 'Snacks & Soup',
    groups: [
      { title: 'Snacks', items: [
        ['Paneer Pakoda', 189], ['Veg Pakoda', 149], ['French Fries', 129], ['Onion Pakoda', 119], ['Veg Momos', 119],
        ['Veg Crispy Momos', 139], ['Chicken Momos', 139], ['Chicken Crispy Momos', 159], ['Paneer Sandwich', 99], ['Veg Sandwich', 79],
        ['Shami Veg Kabab', 139], ['Cheese Corn Nuggets', 149], ['Veg Cutlet', 119], ['Fresh Paneer', 99],
      ] },
      { title: 'Soup', items: [
        ['Veg Manchow Soup', 145], ['Tomato Soup', 149], ['Lemon Coriander Soup', 145],
        ['Veg Hot & Sour Soup', 139], ['Chicken Hot & Sour Soup', 189], ['Chicken Manchow Soup', 189],
      ] },
    ],
  },
  {
    id: 'pizza', name: 'Pizza & Pasta', blurb: 'Italian cuisine',
    groups: [
      { title: 'Veg Pizza', cols: ['Medium 8"', 'Large 12"'], items: [
        ['Margherita Pizza', 189, 239], ['Sweet Corn Pizza', 209, 259], ['Paneer Grill', 219, 249], ['Paneer Makhani', 239, 289, true],
        ['Onion Capsicum', 209, 239], ['Pepperoni', 239, 299], ['Cheese Burst', 229, 299, true], ['Lasagna', 289, null, true],
        ['Mac and Cheese', 209, 209], ['Onion Cheese', 229, 269],
      ] },
      { title: 'Non-Veg Pizza', cols: ['Medium 8"', 'Large 12"'], items: [
        ['Chicken Tikka Pizza', 219, 289], ['Chicken Grill Pizza', 229, 299, true], ['Chicken Cheese Burst', 249, 319],
        ['Chicken Sausage Pizza', 229, 299], ['Chicken Triple Pizza', 309, 389], ['Mexican Pizza', 249, 349, true], ['Lasagna Chicken', 279, null, true],
      ] },
      { title: 'Pasta', cols: ['Veg', 'Non-veg'], items: [
        ['Red Sauce Pasta', 199, 229], ['White Sauce Pasta', 189, 219, true], ['Pink Sauce Pasta', 249, 279], ['Alfredo Pasta', 199, 229],
      ] },
    ],
  },
  {
    id: 'starters', name: 'Starters & Noodles', blurb: 'Chinese and tandoor starters',
    groups: [
      { title: 'Chinese Veg Starter', cols: ['Half', 'Full'], items: [
        ['Crispy Paneer', 209, 259], ['Paneer Chilli', 229, 289, true], ['Veg Manchurian', 209, 269], ['Baby Corn Chilli', 239, null],
        ['Paneer Salt and Pepper', 229, null], ['Paneer 65', 219, null], ['Mushroom Chilli', 249, 269], ['Honey Chilli Potato', 219, null],
        ['Chilli Potato', 229, null], ['Paneer Manchurian', 229, 269], ['Crispy Corn', 239, 239], ['Devil Paneer', 259, 309, true],
      ] },
      { title: 'Chinese Non-Veg Starter', cols: ['Half', 'Full'], items: [
        ['Chicken Chilli', 239, 289, true], ['Chicken Manchurian', 219, 269], ['Chicken 65', null, 249], ['Chicken Hot Garlic', 219, 259],
        ['Crispy Chicken', null, 269], ['Chicken Lollipop', 199, 269], ['Veg Fried Rice', 199, 239], ['Paneer Fried Rice', 239, null],
        ['Schezwan Fried Rice', 179, null], ['Egg Fried Rice', null, 159], ['Chicken Fried Rice', null, 209], ['Devil Chicken', null, 249, true],
      ] },
      { title: 'Tandoor Veg Starter', items: [
        ['Paneer Malai Tikka', 269], ['Paneer Tikka', 249], ['Paneer Achari Tikka', 259], ['Paneer Kali Mirch Tikka', 285],
        ['Mushroom Tikka', 299, null, true], ['Tandoor Platter (10 pcs)', 399], ['Paneer Hariyali Tikka', 269],
      ] },
      { title: 'Tandoor Non-Veg Starter', items: [
        ['Tandoori Chicken', 349], ['Chicken Tikka', 309, null, true], ['Chicken Malai Tikka', 299], ['Chicken Tangadi Kebab', 269],
        ['Chicken Platter', 499, null, true], ['Chicken Seekh Kebab', 249], ['Chicken Kali Mirch', 289], ['Chicken Achari Tikka', 279],
        ['Chicken Hariyali Tikka', 349], ['Chicken Afghani Tikka', 329], ['Mutton Barra', 399], ['Chicken Barra', 299, null, true], ['Chicken Fry', 269],
      ] },
      { title: 'Non-Veg Noodles', items: [
        ['Chicken Noodles', 239], ['Egg Noodles', 175], ['Chicken Chilli Garlic Noodles', 209], ['Chicken Schezwan Noodles', 239],
      ] },
      { title: 'Veg Noodles', items: [
        ['Veg Noodles', 169], ['Paneer Noodles', 209], ['Mushroom Noodles', 219], ['Chilli Garlic Noodles', 199],
        ['Hakka Noodles', 179], ['Schezwan Noodles', 219], ['Bun Garlic Pot Noodles', 249, null, true], ['Malaysia Flat Noodles', 249, null, true],
      ] },
    ],
  },
  {
    id: 'main', name: 'Main Course', blurb: 'Veg and non-veg',
    groups: [
      { title: 'Veg Main Course', cols: ['Half', 'Full'], items: [
        ['Mixed Veg', 209, 279], ['Matar Paneer', 239, 309], ['Mix Veg Kolhapuri', 249, 299, true], ['Mushroom Matar', 249, 289],
        ['Aloo Matar', 199, null], ['Kadhai Paneer', 249, 319], ['Paneer Do Pyaza', 269, 339], ['Paneer Angaraa', 349, 349, true],
        ['Paneer Pasanda', 219, 299], ['Paneer Lahori', 299, 299, true], ['Paneer Lababdar', 249, 329], ['Paneer Butter Masala', 279, 349],
        ['Shahi Paneer', 249, 339], ['Handi Paneer', 259, 329], ['Mushroom Do Pyaza', 229, 319], ['Palak Paneer', 279, null],
        ['Aloo Gobhi Tamatar', 199, null], ['Aloo Jeera', 169, null], ['Dal Tadka', 159, null], ['Dal Fry', 169, null],
      ] },
      { title: 'Non-Veg Main Course', cols: ['Half', 'Full'], items: [
        ['Handi Chicken', 209, 279], ['Chicken Do Pyaza', 199, 279], ['Kadhai Chicken', 209, 289], ['Chicken Masala', null, 315, true],
        ['Bhuna Chicken', 239, 379], ['Egg Curry', 219, 239], ['Chicken Curry', 219, 279, true], ['Butter Chicken', 239, 339],
        ['Chicken Lababdar', 249, 309], ['Chicken Kali Mirch', 229, 319], ['Mutton Handi', 289, 399], ['Mutton Do Pyaza', 299, 399],
        ['Mutton Curry', 289, 389], ['Mutton Rogan Josh', 289, 399], ['Murg Massalam', 499, null, true], ['Mutton Korma', 279, 399],
        ['Mutton Angara', 289, 419, true],
      ] },
    ],
  },
  {
    id: 'rice', name: 'Biryani & Rice', blurb: 'Flavourful rice',
    groups: [
      { title: 'Biryani', cols: ['Half', 'Full'], items: [
        ['Veg Biryani', 209, 279], ['Paneer Biryani', 229, 299], ['Paneer Tikka Biryani', 249, 309], ['Egg Biryani', null, 299],
        ['Chicken Biryani', 239, 309], ['Mutton Biryani', 279, 399], ['Bamboo Mutton Biryani', null, 499, true],
        ['Bamboo Chicken Biryani', null, 469, true], ['Bamboo Mushroom Biryani', null, 419, true],
        ['Chicken Tikka Biryani', null, 299], ['Mushroom Tikka Biryani', null, 399],
      ] },
      { title: 'Rice', cols: ['Half', 'Full'], items: [
        ['Plain Rice', 119, 159], ['Jeera Rice', 139, 179], ['Veg Pulao', 209, 289], ['Matar Pulao', 149, 189], ['Special Garlic Rice', 149, 189],
      ] },
    ],
  },
  {
    id: 'breads', name: 'Add-ons', blurb: 'Breads, raita, salad and papad',
    groups: [
      { title: 'Breads (Rotis)', items: [
        ['Tandoori Roti', 22], ['Butter Roti', 29], ['Lacha Paratha', 39], ['Butter Naan', 45], ['Garlic Naan', 49], ['Cheese Naan', 55],
        ['Aloo Paratha', 69], ['Paneer Paratha', 89], ['Gobhi Paratha', 69], ['Onion Kulcha', 59], ['Stuff Naan', 49],
        ['Missi Roti', 35], ['Rumali Roti', 35], ['Roti Platter', 189, null, true],
      ] },
      { title: 'Raita', items: [['Plain Dahi', 49], ['Mixed Raita', 75], ['Boondi Raita', 59], ['Fruit Raita', 109], ['Pineapple Raita', 99]] },
      { title: 'Salad', items: [['Green Salad', 49], ['Onion Salad', 69], ['Cucumber Salad', 49], ['Mixed Salad', 89]] },
      { title: 'Papad', items: [['Papad Dry', 29], ['Papad Fry', 29], ['Masala Papad', 79]] },
    ],
  },
  {
    id: 'thali', name: 'Thali',
    thalis: [
      ['Maharaja Thali', 329, 'Butter roti, kadhai paneer, mix veg, dal, papad, pickle, pulao, sweets, salad'],
      ['Deluxe Thali', 369, 'Butter naan, paneer lababdar, mix veg, dal makhani, papad, pickle, rice, sweets, salad'],
      ['Awadh Thali', 399, 'Rumali roti, chicken korma, roasted chicken, rice, sweets, pickle, papad, salad'],
      ['Mughlai Thali', 429, 'Lachha paratha (2), chicken lababdar, biryani rice, sweet, pickle, papad, salad'],
      ['Plain Thali', 219, 'Tandoori roti, dal, vegetable sabji, papad, pickle, salad, plain rice'],
      ['Blessings Special Thali', 499, 'Paneer angaara, shahi paneer, mix veg, aloo gobhi, dal fry, dal makhani, butter naan, lacha paratha, pulao, salad, gulab jamun, ice cream', true],
    ],
  },
];
