// Функции для конвертации между строками и ArrayBuffer
function stringToArrayBuffer(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

function arrayBufferToString(buffer) {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

// Генерация ключа AES-GCM
async function generateKey() {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// Шифрование текста
async function encryptText(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // Инициализационный вектор
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    stringToArrayBuffer(text)
  );
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  };
}

// Дешифрование текста
async function decryptText(encryptedData, key) {
  const iv = new Uint8Array(encryptedData.iv);
  const data = new Uint8Array(encryptedData.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return arrayBufferToString(decrypted);
}

// Сохранение ключа в storage (для примера, лучше использовать Secure Storage)
async function saveKey(key) {
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const keyArray = Array.from(new Uint8Array(rawKey));
  chrome.storage.sync.set({ encryptionKey: keyArray });
}

// Загрузка ключа из storage
async function loadKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['encryptionKey'], async (result) => {
      if (result.encryptionKey) {
        const keyBuffer = new Uint8Array(result.encryptionKey);
        const cryptoKey = await crypto.subtle.importKey(
          "raw",
          keyBuffer,
          { name: "AES-GCM" },
          true,
          ["encrypt", "decrypt"]
        );
        resolve(cryptoKey);
      } else {
        const newKey = await generateKey();
        await saveKey(newKey);
        resolve(newKey);
      }
    });
  });
}

let encryptionKey = null;

document.addEventListener('DOMContentLoaded', async () => {
  encryptionKey = await loadKey();

  //loadGroups();  // Загрузить группы
  loadEntries();  // Загрузить записи выбранной группы по умолчанию
  const addButton = document.getElementById('add-button');
  const modal = document.getElementById('add-modal');
  const closeModal = document.getElementById('close-modal');
  const addForm = document.getElementById('add-form');
  const entriesContainer = document.getElementById('entries');

  const settingsButton = document.getElementById('settings-button');
  const groupModal = document.getElementById('group-modal');
  const closeGroupModal = document.getElementById('close-group-modal');
  const groupForm = document.getElementById('group-form');
  const groupNameInput = document.getElementById('group-name');
  const groupList = document.getElementById('group-list');
  const groupSelect = document.getElementById('groupSelect');

  // Открыть модальное окно добавления записи
  addButton.addEventListener('click', () => {
    // Проверяем, есть ли группы для выбора
    chrome.storage.sync.get(['groups'], (result) => {
      const groups = result.groups || [];
      if (groups.length === 0) {
        alert('Сначала создайте группу через настройки.');
        return;
      }
      modal.style.display = 'block';
    });
  });

  // Закрыть модальное окно добавления записи
  closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Открыть модальное окно управления группами
  settingsButton.addEventListener('click', () => {
    groupModal.style.display = 'block';
    loadGroupList();
  });

  // Закрыть модальное окно управления группами
  closeGroupModal.addEventListener('click', () => {
    groupModal.style.display = 'none';
  });

  // Закрыть модальные окна при клике вне их
  window.addEventListener('click', (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
    if (event.target == groupModal) {
      groupModal.style.display = 'none';
    }
  });

  // Обработка формы добавления записи
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const login = document.getElementById('login').value.trim();
    const password = document.getElementById('password').value.trim();
    const selectedGroup = groupSelect.value;

    if (name && login && password && selectedGroup) {
      // Шифрование логина и пароля
      const encryptedLogin = await encryptText(login, encryptionKey);
      const encryptedPassword = await encryptText(password, encryptionKey);

      const newEntry = { group: selectedGroup, name, login: encryptedLogin, password: encryptedPassword };
      chrome.storage.sync.get(['entries'], (result) => {
        const entries = result.entries || [];
        entries.push(newEntry);
        chrome.storage.sync.set({ entries }, () => {
          loadEntries();
          addForm.reset();
          modal.style.display = 'none';
        });
      });
    }
  });

  // Обработка формы добавления группы
  groupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const groupName = groupNameInput.value.trim();
    if (groupName) {
      addGroup(groupName);
      groupNameInput.value = '';
      loadGroupList(); // Обновить список групп в модальном окне
    }
  });

  // Функция загрузки групп в выпадающий список и список в модальном окне
  function loadGroups() {
  chrome.storage.sync.get(['groups'], (result) => {
    const groups = result.groups || [];
    groupSelect.innerHTML = ''; // Очистить текущие опции

    groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group;
      option.textContent = group;
      groupSelect.appendChild(option);
    });

    // Если нет групп, добавить опцию по умолчанию
    if (groups.length === 0) {
      const option = document.createElement('option');
      option.value = 'Без группы';
      option.textContent = 'Без группы';
      groupSelect.appendChild(option);
    } else {
      // Выбираем первую группу по умолчанию
      groupSelect.selectedIndex = 0; 
      loadEntries(); // Загрузка записей для первой группы
    }
  });
}


  // Функция добавления новой группы
  function addGroup(groupName) {
    chrome.storage.sync.get(['groups'], (result) => {
      const groups = result.groups || [];
      if (!groups.includes(groupName)) {
        groups.push(groupName);
        chrome.storage.sync.set({ groups }, () => {
          loadGroups();
          loadGroupList();
        });
      } else {
        alert('Группа с таким названием уже существует.');
      }
    });
  }

  // Функция загрузки списка групп в модальном окне управления группами
  function loadGroupList() {
    chrome.storage.sync.get(['groups'], (result) => {
      const groups = result.groups || [];
      groupList.innerHTML = ''; // Очистить текущий список

      if (groups.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет доступных групп.';
        groupList.appendChild(li);
        return;
      }

      groups.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Удалить';
        deleteBtn.className = 'delete-group-button';
        deleteBtn.dataset.groupName = group;

        deleteBtn.addEventListener('click', () => {
          if (confirm(`Вы уверены, что хотите удалить группу "${group}"? Все записи в этой группе также будут удалены.`)) {
            deleteGroup(group);
          }
        });

        li.appendChild(deleteBtn);
        groupList.appendChild(li);
      });
    });
  }

  // Загрузка записей при инициализации
  loadEntries();
  loadGroups();

  // Функция загрузки записей
  async function loadEntries() {
  const selectedGroup = groupSelect.value;  // Получаем выбранную группу
  chrome.storage.sync.get(['entries'], async (result) => {
    const entries = result.entries || [];
    
    // Фильтрация записей по выбранной группе
    const groupEntries = entries.filter(entry => entry.group === selectedGroup);
    
    // Очистить контейнер
    entriesContainer.innerHTML = '';

    if (groupEntries.length === 0) {
      entriesContainer.innerHTML = '<p>Нет записей в этой группе.</p>';
    }

    // Отобразить записи группы
    for (let i = 0; i < groupEntries.length; i++) {
      const entry = groupEntries[i];
      const decryptedLogin = await decryptText(entry.login, encryptionKey);
      const decryptedPassword = await decryptText(entry.password, encryptionKey);

      const entryDiv = document.createElement('div');
      entryDiv.className = 'entry';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'info';
      infoDiv.innerHTML = `<span class="name">${entry.name}</span><span class="number">№${i + 1}</span>`;
      
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'actions';

      const highlightBtn = document.createElement('button');
      highlightBtn.className = 'highlight-button';
      highlightBtn.textContent = 'Выделить';
      highlightBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Предотвратить всплытие события
        toggleHighlight(entryDiv);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-button';
      deleteBtn.textContent = 'Удалить';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Предотвратить всплытие события
        deleteEntry(entry);
      });

      actionsDiv.appendChild(highlightBtn);
      actionsDiv.appendChild(deleteBtn);

      entryDiv.appendChild(infoDiv);
      entryDiv.appendChild(actionsDiv);

      // Добавить возможность копирования данных в буфер при клике на запись
      entryDiv.addEventListener('click', (e) => {
        // Избежать срабатывания при клике на кнопки
        if (e.target.tagName.toLowerCase() !== 'button') {
          const loginAndPassword = `Логин: ${decryptedLogin}\nПароль: ${decryptedPassword}`;
          navigator.clipboard.writeText(`${decryptedLogin} ${decryptedPassword}`)
            .then(() => alert(`Скопировано:\n${loginAndPassword}`))
            .catch(err => console.error('Ошибка копирования:', err));
        }
      });

      entriesContainer.appendChild(entryDiv);
    }
  });
}


  // Функция удаления группы и связанных записей
  function deleteGroup(groupName) {
    chrome.storage.sync.get(['groups', 'entries'], (result) => {
      let groups = result.groups || [];
      let entries = result.entries || [];

      // Удалить группу из списка групп
      groups = groups.filter(group => group !== groupName);

      // Удалить все записи, принадлежащие удаляемой группе
      entries = entries.filter(entry => entry.group !== groupName);

      chrome.storage.sync.set({ groups, entries }, () => {
        loadGroups();
        loadGroupList();
        loadEntries();
      });
    });
  }

  // Функция удаления записи
  function deleteEntry(entryToDelete) {
    if (confirm('Вы уверены, что хотите удалить эту запись?')) {
      chrome.storage.sync.get(['entries'], (result) => {
        const entries = result.entries || [];
        const filteredEntries = entries.filter(entry => 
          !(entry.group === entryToDelete.group && 
            entry.name === entryToDelete.name && 
            JSON.stringify(entry.login) === JSON.stringify(entryToDelete.login) && 
            JSON.stringify(entry.password) === JSON.stringify(entryToDelete.password))
        );
        chrome.storage.sync.set({ entries: filteredEntries }, () => {
          loadEntries();
        });
      });
    }
  }

  // Функция выделения записи
  function toggleHighlight(element) {
    element.classList.toggle('highlighted');
  }

  // Функция копирования логина и пароля в буфер обмена
  function copyToClipboard(login, password) {
    // Создаем временные текстовые области для копирования
    const tempLogin = document.createElement('textarea');
    tempLogin.value = login;
    document.body.appendChild(tempLogin);
    tempLogin.select();
    document.execCommand('copy');
    document.body.removeChild(tempLogin);

    const tempPassword = document.createElement('textarea');
    tempPassword.value = password;
    document.body.appendChild(tempPassword);
    tempPassword.select();
    document.execCommand('copy');
    document.body.removeChild(tempPassword);

    alert('Логин и пароль скопированы в буфер обмена.');
  }

  // Обновление записей при смене выбранной группы
  groupSelect.addEventListener('change', () => {
    loadEntries();
  });
});
