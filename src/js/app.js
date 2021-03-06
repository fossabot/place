function getQueryVariable(variable) {
  var query = window.location.search.substring(1);
  var vars = query.split('&');
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) === variable) {
      return decodeURIComponent(pair[1]);
    }
  }
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgb2hex(rgb) {
  rgb = rgb.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i);
  return (rgb && rgb.length === 4) ? "#" +
    ("0" + parseInt(rgb[1], 10).toString(16)).slice(-2) +
    ("0" + parseInt(rgb[2], 10).toString(16)).slice(-2) +
    ("0" + parseInt(rgb[3], 10).toString(16)).slice(-2) : '';
}

window.App = {
  elements: {
    board: $("#board"),
    palette: $(".palette"),
    boardMover: $(".board-mover"),
    boardZoomer: $(".board-zoomer"),
    boardContainer: $(".board-container"),
    cursor: $(".cursor"),
    timer: $(".cooldown-timer"),
    reticule: $(".reticule"),
    alert: $(".message"),
    coords: $(".coords"),
    pixelInfo: $('.pixel-info'),

    chatContainer: $('.chat-container'),
    usersContainer: $('.users-container'),
    loginContainer: $('.login-container'),

    chatToggle: $('.toggle-chat'),
    usersToggle: $('.toggle-users'),
    loginToggle: $('.toggle-login'),

    loginButton: $('.login-button'),
    chatInput: $('.chat-input'),

    restrictedToggle: $('.restricted-toggle')
  },
  panX: 0,
  panY: 0,
  scale: 4,
  maxScale: 40,
  minScale: 0.75,
  cooldown: 0,
  color: null,
  init: function () {
    this.color = null;
    this.connectionLost = false;
    this.showRestrictedAreas = false;
    this.restrictedAreas = null;

    this.username = null;
    this.spectate_user = null;

    $(".board-container").hide();
    $(".reticule").hide();
    $(".ui").hide();
    $('.message').hide();
    $(".cursor").hide();
    $(".cooldown-timer").hide();
    this.elements.usersToggle.hide();

    $.get("/boardinfo", this.initBoard.bind(this));

    this.elements.pixelInfo.click(function () {
      this.elements.pixelInfo.addClass('hide');
    }.bind(this));

    this.initBoardMovement();
    this.initBoardPlacement();
    this.initCursor();
    this.initReticule();
    this.initAlert();
    this.initCoords();
    this.initSidebar();
    this.initMoveTicker();
    this.initRestrictedAreas();
    this.initContextMenu();
    Notification.requestPermission();
  },
  initBoard: function (data) {
    this.width = data.width;
    this.height = data.height;
    this.palette = data.palette;
    this.custom_colors = data.custom_colors;

    this.initPalette();

    this.elements.board.attr("width", this.width).attr("height", this.height);

    this.updateTransform();

    var cx = getQueryVariable("x") || this.width / 2;
    var cy = getQueryVariable("y") || this.height / 2;
    if (cx < 0 || cx >= this.width) cx = this.width / 2;
    if (cy < 0 || cy >= this.height) cx = this.height / 2;
    this.centerOn(cx, cy);

    this.scale = getQueryVariable("scale") || this.scale;
    this.updateTransform();

    this.initSocket();
    this.drawBoard();
  },
  drawBoard: function () {
    this.image = new Image();

    this.image.onload = function () {
      if (this.connectionLost) this.alert(null);
      var ctx = this.elements.board[0].getContext("2d");
      ctx.drawImage(this.image, 0, 0, this.width, this.height);
    }.bind(this);

    this.image.onerror = function () {
      this.alert('Refreshing board...');
      setTimeout(this.drawBoard.bind(this), 1000);
    }.bind(this);

    this.image.src = '/boarddata?d=' + Date.now();
  },
  initRestrictedAreas: function () {
    this.elements.restrictedToggle.click(this.restrictedAreaToggle.bind(this));
  },
  restrictedAreaToggle: function () {
    this.loadRestrictedAreas();
    this.showRestrictedAreas = !this.showRestrictedAreas;
    if (this.showRestrictedAreas) {
      this.elements.restrictedToggle.text('Hide Restricted Areas');
    } else {
      this.elements.restrictedToggle.text('Show Restricted Areas');
    }
  },
  loadRestrictedAreas: function () {
    if (this.restrictedAreas === null) {
      $.get('/restricted', function (restrictions) {
        this.restrictedAreas = [];
        restrictions.forEach(function (restriction) {
          restriction.div = $('<div>', { class: 'selection' });
          $('.ui').append(restriction.div);
          this.restrictedAreas.push(restriction);
        }.bind(this));
      }.bind(this));
    }

    this.elements.board.on('mousemove', function (evt) {
      if (this.restrictedAreas === null) return;

      this.restrictedAreas.forEach(function (restrictedArea) {
        if (this.showRestrictedAreas) {
          var scaleX = (restrictedArea.endX - (restrictedArea.startX - 1)) * App.scale;
          var scaleY = (restrictedArea.endY - (restrictedArea.startY - 1)) * App.scale;

          var screenPos = App.boardToScreenSpace(restrictedArea.startX, restrictedArea.startY);
          restrictedArea.div.css("transform", "translate(" + screenPos.x + "px, " + screenPos.y + "px)");
          restrictedArea.div.css("width", scaleX + "px").css("height", scaleY + "px");
          restrictedArea.div.show();
        } else {
          restrictedArea.div.hide();
        }
      }.bind(this));
    }.bind(this));
  },
  initPalette: function () {
    this.palette.forEach(function (color, idx) {
      $("<div>")
        .addClass("palette-color")
        .css("background-color", color)
        .click(function () {
          if (this.cooldown === 0) {
            this.switchColor(color);
          } else {
            this.switchColor(null);
          }
        }.bind(this))
        .appendTo(this.elements.palette);
    }.bind(this));

    if (this.custom_colors) {
      $("<input>")
        .addClass('color-picker')
        .appendTo(this.elements.palette);
      var picker = $(".color-picker").spectrum({
        showPalette: true,
        showInput: true,
        allowEmpty: true,
        preferredFormat: "hex",
        localStorageKey: "kti.place",
        change: function (color) {
          this.switchColor((color !== null) ? color.toHexString() : null);
        }.bind(this),
        show: function () {
          $(".color-picker").spectrum("reflow");
        }
      });
    }
  },
  initBoardMovement: function () {
    var handleMove = function (evt) {
      this.panX += evt.dx / this.scale;
      this.panY += evt.dy / this.scale;
      this.updateTransform();
    }.bind(this);

    interact(this.elements.boardContainer[0]).draggable({
      inertia: false,
      onmove: handleMove
    }).gesturable({
      onmove: function (evt) {
        this.scale *= (1 + evt.ds);
        this.updateTransform();
        handleMove(evt);
      }.bind(this)
    }).styleCursor(false);

    $(document).on('keydown', function (evt) {
      if (evt.target.nodeName === 'BODY') {
        if (evt.keyCode === 87 || evt.keyCode === 38) {
          // Up movement, up arrow or w
          this.panY = (evt.shiftKey) ? this.panY += 1 : this.panY += 100 / this.scale;
        } else if (evt.keyCode === 83 || evt.keyCode === 40) {
          // Down movement, down arrow or s
          this.panY = (evt.shiftKey) ? this.panY -= 1 : this.panY -= 100 / this.scale;
        } else if (evt.keyCode === 65 || evt.keyCode === 37) {
          // Left movement, left arrow or a
          this.panX = (evt.shiftKey) ? this.panX += 1 : this.panX += 100 / this.scale;
        } else if (evt.keyCode === 68 || evt.keyCode === 39) {
          // Right movement, right arrow or d
          this.panX = (evt.shiftKey) ? this.panX -= 1 : this.panX -= 100 / this.scale;
        } else if (evt.keyCode === 81 || evt.keyCode === 34) {
          // Zoom out, q key or page down
          this.scale /= 1.3;
          this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale));
        } else if (evt.keyCode === 69 || evt.keyCode === 33) {
          // Zoom in, e key or page up
          this.scale *= 1.3;
          this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale));
        } else if (evt.keyCode === 27) {
          // Clear color, escape key
          this.switchColor(null);
          this.elements.pixelInfo.addClass('hide');
          this.elements.reticule.hide();
          this.elements.cursor.hide();
        }

        this.updateTransform();
      }
    }.bind(this));

    this.elements.boardContainer.on('wheel', function (evt) {
      this.elements.pixelInfo.addClass('hide');

      var oldScale = this.scale;

      if (evt.originalEvent.deltaY > 0) {
        this.scale /= 1.3
      } else {
        this.scale *= 1.3;
      }

      this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale));

      var dx = evt.clientX - this.elements.boardContainer.width() / 2;
      var dy = evt.clientY - this.elements.boardContainer.height() / 2;

      this.panX -= dx / oldScale;
      this.panX += dx / this.scale;

      this.panY -= dy / oldScale;
      this.panY += dy / this.scale;

      this.updateTransform();
    }.bind(this));
  },
  initBoardPlacement: function () {
    var downX, downY;
    var clickTriggered = false;

    var downFn = function (evt) {
      downX = evt.clientX;
      downY = evt.clientY;
      clickTriggered = false;
    };

    var upFn = function (evt) {
      if (this.spectate_user !== null) {
        this.spectate_user = null;
        this.alert(null);
      }

      var dx = Math.abs(downX - evt.clientX);
      var dy = Math.abs(downY - evt.clientY);

      if (!clickTriggered) {
        clickTriggered = true;

        if (dx < 5 && dy < 5 && evt.which === 1) {
          var pos = this.screenToBoardSpace(evt.clientX, evt.clientY);

          if (this.color !== null && this.cooldown <= 0) {
            // Place
            this.elements.pixelInfo.addClass('hide');
            this.place(pos.x, pos.y);
          } else if (this.color === null) {
            if (window.ModTools && window.ModTools.selectionModeEnabled) return;

            // Get pixel info
            this.centerOn(pos.x, pos.y);
            var pixelScreenPos = this.boardToScreenSpace(pos.x, pos.y);
            var diff = 0.5 * this.scale;

            this.elements.pixelInfo.css("transform", "translate(" + Math.floor(pixelScreenPos.x + diff) + "px, " + Math.floor(pixelScreenPos.y + diff) + "px)");
            this.elements.pixelInfo.text('Loading');
            this.elements.pixelInfo.removeClass('hide');
            $.get('/pixel?x=' + pos.x + '&y=' + pos.y, function (data) {
              if (data !== null) {
                var rgb = 'rgb(' + data.colorR + ',' + data.colorG + ',' + data.colorB + ')';
                var span = $('<span>').css('background-color', rgb);
                span.click(function () {
                  this.switchColor(rgb2hex(rgb));
                }.bind(this));
                var date = moment(data.createdAt).format('DD/MM/YYYY hh:mm:ss a');
                this.elements.pixelInfo.text('Placed by ' + data.username + " at " + date);
                span.prependTo(this.elements.pixelInfo);
              } else {
                this.elements.pixelInfo.text('Nothing has been placed here!');
              }
            }.bind(this));
          }
        } else {
          this.elements.pixelInfo.addClass('hide');
        }
      }
    }.bind(this);
    this.elements.board.on("pointerdown", downFn).on("mousedown", downFn).on("pointerup", upFn).on("mouseup", upFn).contextmenu(function (evt) {
      evt.preventDefault();
      this.switchColor(null);
    }.bind(this));
  },
  initCursor: function () {
    var fn = function (evt) {
      this.elements.cursor.css("transform", "translate(" + evt.clientX + "px, " + evt.clientY + "px)");
    }.bind(this);
    this.elements.boardContainer.on("pointermove", fn).on("mousemove", fn);
  },
  initReticule: function () {
    var fn = function (evt) {
      var boardPos = this.screenToBoardSpace(evt.clientX, evt.clientY);
      boardPos.x |= 0;
      boardPos.y |= 0;

      var screenPos = this.boardToScreenSpace(boardPos.x, boardPos.y);
      this.elements.reticule.css("transform", "translate(" + screenPos.x + "px, " + screenPos.y + "px)");
      this.elements.reticule.css("width", this.scale - 1 + "px").css("height", this.scale - 1 + "px");

      if (this.color === null) {
        this.elements.reticule.hide();
      } else {
        this.elements.reticule.show();
      }
    }.bind(this);
    this.elements.board.on("pointermove", fn).on("mousemove", fn);
  },
  initCoords: function () {
    this.elements.board.on("mousemove", function (evt) {
      var boardPos = this.screenToBoardSpace(evt.clientX, evt.clientY);

      this.elements.coords.text("(" + boardPos.x + ", " + boardPos.y + ")");
    }.bind(this));
  },
  initAlert: function () {
    this.elements.alert.find(".close").click(function () {
      this.elements.alert.fadeOut(200);
    }.bind(this));
  },
  initSocket: function () {
    var pendingMessages = 0;

    this.socket = io();
    this.socket.on('connect', function () {
      $(".board-container").show();
      $(".ui").show();
      $(".loading").fadeOut(500);
      this.elements.alert.fadeOut(200);

      if (this.connectionLost) {
        this.drawBoard();
      }
    }.bind(this));

    this.socket.on('disconnect', function () {
      this.connectionLost = true;
      this.elements.loginButton.prop('disabled', false);
      this.alert('Disconnected from server... Attempting to reconnect');
    }.bind(this));

    var moveTickerBody = $('.move-ticker-body');

    // Events sent by websocket
    this.socket.on('session', function (data) {
      if (data.userdata) this.onAuthentication(data.userdata);
      else if (this.username !== null) this.onAuthentication({ success: false });
      if (data.cooldown) this.updateTime(data.cooldown);
      else this.updateTime(0);
      this.updateUserCount(data.users.connected);
      this.updateUserList(data.users);
    }.bind(this));

    this.socket.on('place', function (data) {
      var ctx = this.elements.board[0].getContext("2d");
      ctx.fillStyle = data.color;
      ctx.fillRect(data.x, data.y, 1, 1);

      if (moveTickerBody.is(':visible')) {
        var div = $('<div>', { 'class': 'chat-line' }).appendTo(moveTickerBody);
        $('<span>', { "class": 'username' }).text(data.session_id).appendTo(div);
        $('<a>', { href: 'javascript:App.centerOn(' + data.x + ',' + data.y + ')' }).text(': ' + data.x + ', ' + data.y).appendTo(div);
        moveTickerBody.scrollTop(moveTickerBody.prop('scrollHeight'));
        if (moveTickerBody.children().length >= 15) {
          moveTickerBody.children().first().remove();
        }
      }

      if (this.spectate_user !== null && this.spectate_user === data.session_id) {
        this.centerOn(data.x, data.y);
      }
    }.bind(this));

    this.socket.on('alert', function (message) {
      this.alert(message);
    }.bind(this));

    this.socket.on('cooldown', function (wait) {
      this.updateTime(wait);
    }.bind(this));

    this.socket.on('force-sync', function () {
      this.drawBoard();
    }.bind(this));

    this.socket.on('auth', function (data) {
      if (data.message) this.alert(data.message);
      this.onAuthentication(data);
    }.bind(this));

    this.socket.on('users', function (data) {
      this.updateUserCount(data.connected);
      this.updateUserList(data);
    }.bind(this));

    this.socket.on('chat', function (data) {
      var d = $('.chat-log');
      var div = $('<div>', { 'class': 'chat-line' }).appendTo(d);
      var username = $('<span>', { "class": 'username' }).text(data.chat_id);
      var message = $('<span>', { "class": 'chat-message' }).text(data.message);

      if (this.elements.chatContainer.is(':hidden') && pendingMessages <= 125) {
        pendingMessages++;
        this.elements.chatToggle.text('Chat (' + pendingMessages + ')');
      } else pendingMessages = 0;

      // For regex tests
      var m, re, index, replacementLength, newLength, i;
      var notified = false;
      var matches = [];

      // Check for username in chat indicated by '@'
      var re = /(@[a-z0-9]+)/gi;
      do {
        m = re.exec(message.html());
        if (m) {
          var ref = m[0].replace('@', '').toLowerCase();
          if (!notified && data.chat_id !== this.username && (ref === this.username || ref === 'everyone' || ref === 'world')) {
            notified = true;
            new Notification("Place Reloaded", {
              body: 'Message from ' + data.chat_id + ': ' + data.message
            });
          }

          var usernameRef = $('<span>', { class: 'username' }).text(m[0]).prop('outerHTML');
          matches.push({ div: usernameRef, index: m.index, length: m[0].length });
        }
      } while (m);

      for (i = matches.length - 1; i >= 0; i--) {
        message.html(message.html().substr(0, matches[i].index) + matches[i].div + message.html().substr(matches[i].index + matches[i].length, message.html().length));
      }
      matches = [];

      // Check for coordinates in message
      re = /([0-9]+)+\,(\ +)?([0-9]+)/g;
      do {
        m = re.exec(message.html());
        if (m) {
          var coords = m[0].split(',');
          if (coords[0] < 0 || coords[0] > this.width || coords[1] < 0 || coords[1] > this.height) continue;
          var coordDiv = $('<a>', { class: '', href: 'javascript:App.centerOn(' + coords[0] + ',' + coords[1] + ')' }).text(m[0]).prop('outerHTML');
          matches.push({ div: coordDiv, index: m.index, length: m[0].length });
        }
      } while (m);

      for (i = matches.length - 1; i >= 0; i--) {
        message.html(message.html().substr(0, matches[i].index) + matches[i].div + message.html().substr(matches[i].index + matches[i].length, message.html().length));
      }

      if (data.is_moderator) username.addClass('moderator');
      $('<span>', { class: 'timestamp' }).append($('<small>').text(moment().format('HH:mm'))).appendTo(div);
      username.appendTo(div);
      $('<span>', { class: 'colon' }).text(':').appendTo(div);
      message.appendTo(div);
      d.scrollTop(d.prop('scrollHeight'));
      if (d.children().length >= 125) {
        d.find('.chat-line:first').remove();
      }
    }.bind(this));
  },
  updateUserList: function (data) {
    var usersList = $('.moderators');
    var userListSection = usersList.closest('.user-list-section');

    if (data.moderators.length !== 0) {
      usersList.empty();
      userListSection.show();
      data.moderators.forEach(function (user) {
        $('<div>', { class: 'username moderator' }).text(user).appendTo(usersList);
      });
    } else {
      userListSection.hide();
    }

    usersList = $('.registered');
    userListSection = usersList.closest('.user-list-section');
    if (data.registered.length !== 0) {
      usersList.empty();
      userListSection.show();
      data.registered.forEach(function (user) {
        $('<div>', { class: 'username' }).text(user).appendTo(usersList);
      });
    } else {
      userListSection.hide();
    }

    usersList = $('.anons');
    userListSection = usersList.closest('.user-list-section');
    if (data.anons.length !== 0) {
      usersList.empty();
      userListSection.show();
      data.anons.forEach(function (user) {
        $('<div>', { class: 'username' }).text(user).appendTo(usersList);
      });
    } else {
      userListSection.hide();
    }
  },
  initContextMenu: function () {
    // We need multiple triggers for mobile and desktop.
    var triggers = ['right', 'left'];
    triggers.forEach(function (trigger) {
      $.contextMenu({
        selector: '.username',
        trigger: trigger,
        zIndex: 1000,
        autoHide: true,
        items: {
          spectate: {
            name: 'Spectate',
            callback: function (itemKey, opt) {
              App.spectate(opt.$trigger.text());
            }
          },
          mention: {
            name: 'Mention',
            callback: function (itemKey, opt) {
              App.mention(opt.$trigger.text());
            }
          }
        }
      });
    });
  },
  updateUserCount: function (count) {
    this.elements.usersToggle.fadeIn(200);
    this.elements.usersToggle.text('Users: ' + count);
  },
  authenticate: function () {
    this.socket.emit('auth', {
      username: $('#username').val(),
      password: $('#password').val()
    });
  },
  onAuthentication: function (data) {
    if (data.success) {
      this.elements.loginToggle.text('Logout');
      this.elements.loginContainer.hide();
      this.elements.palette.removeClass('palette-sidebar');
      this.username = data.username;

      if (data.is_moderator && !window.ModTools) {
        $.get('js/mod_tools.js');
      }
    } else {
      if (this.username !== null) return location.reload();
      this.elements.loginToggle.text('Login');
      this.elements.loginButton.prop('disabled', false);
    }
  },
  initSidebar: function () {
    this.elements.chatToggle.click(function () {
      this.elements.chatContainer.toggle();
      this.elements.usersContainer.hide();
      this.elements.loginContainer.hide();
      this.elements.chatToggle.text('Chat');

      this.elements.palette.toggleClass('palette-sidebar', this.elements.chatContainer.is(':visible'));
    }.bind(this));

    this.elements.usersToggle.click(function () {
      this.elements.chatContainer.hide();
      this.elements.usersContainer.toggle();
      this.elements.loginContainer.hide();

      this.elements.palette.toggleClass('palette-sidebar', this.elements.usersContainer.is(':visible'));
    }.bind(this));

    this.elements.loginToggle.click(function () {
      if (this.username !== null) {
        this.socket.emit('logout');
        return location.reload();
      }
      this.elements.chatContainer.hide();
      this.elements.usersContainer.hide();
      this.elements.loginContainer.toggle();

      this.elements.palette.toggleClass('palette-sidebar', this.elements.loginContainer.is(':visible'));
    }.bind(this));

    this.elements.loginButton.click(function () {
      this.elements.loginButton.prop('disabled', true);
      this.authenticate();
    }.bind(this));

    this.elements.chatInput.keypress(function (e) {
      if (e.which == 13) {
        e.preventDefault();

        var data = this.elements.chatInput.val();
        if (data === '') return;

        this.socket.emit('chat', data);
        this.elements.chatInput.val('');
      }
    }.bind(this));
  },
  initMoveTicker: function () {
    var userListContainer = $('.user-list');
    var moveTickerHeader = $('.move-ticker-header');
    var moveTickerBody = $('.move-ticker-body');

    moveTickerHeader.click(function () {
      moveTickerBody.toggle();
      moveTickerBody.scrollTop(moveTickerBody.prop('scrollHeight'));

      if (moveTickerBody.is(':visible')) {
        userListContainer.addClass('user-list-ticker');
      } else {
        userListContainer.removeClass('user-list-ticker');
      }
    });
  },
  updateTransform: function () {

    if (this.panX <= -this.width / 2) {
      this.panX = -this.width / 2;
    }
    if (this.panX >= this.width / 2) {
      this.panX = this.width / 2;
    }
    if (this.panY <= -this.height / 2) {
      this.panY = -this.height / 2;
    }
    if (this.panY >= this.height / 2) {
      this.panY = this.height / 2;
    }

    this.elements.boardMover
      .css("width", this.width + "px")
      .css("height", this.height + "px")
      .css("transform", "translate(" + this.panX + "px, " + this.panY + "px)");
    this.elements.reticule.css("width", this.scale + "px").css("height", this.scale + "px");
    this.elements.boardZoomer.css("transform", "scale(" + this.scale + ")");
  },
  screenToBoardSpace: function (screenX, screenY) {
    var boardBox = this.elements.board[0].getBoundingClientRect();
    var boardX = (((screenX - boardBox.left) / this.scale) | 0),
      boardY = (((screenY - boardBox.top) / this.scale) | 0);
    return { x: boardX, y: boardY };
  },
  boardToScreenSpace: function (boardX, boardY) {
    var boardBox = this.elements.board[0].getBoundingClientRect();
    var x = boardX * this.scale + boardBox.left,
      y = boardY * this.scale + boardBox.top;
    return { x: x, y: y };
  },
  centerOn: function (x, y) {
    this.panX = (this.width / 2 - x) - 0.5;
    this.panY = (this.height / 2 - y) - 0.5;
    this.elements.coords.text("(" + x + ", " + y + ")");
    this.updateTransform();
  },
  switchColor: function (newColor) {
    this.color = newColor;

    if (newColor === null) {
      this.elements.cursor.hide();
    } else {
      this.elements.cursor.show();
      this.elements.cursor.css("background-color", newColor);
    }
  },
  place: function (x, y) {
    if (this.color === null) return;

    this.socket.emit('place', {
      x: x,
      y: y,
      color: this.color
    });

    //this.switchColor(-1);
  },
  alert: function (message) {
    var alert = this.elements.alert;
    if (message === null) {
      this.elements.alert.fadeOut(200);
      return;
    }

    alert.find(".text").text(message);
    alert.fadeIn(200);
  },
  updateTime: function (cooldown) {
    if (typeof cooldown !== 'undefined') this.cooldown = cooldown;
    else this.cooldown -= 1;

    if (this.cooldown < 0) this.cooldown = 0;
    this.cooldown |= 0;

    if (this.cooldown !== 0) {
      this.elements.timer.show();
      var secs = Math.floor(this.cooldown % 60);
      var secsStr = secs < 10 ? "0" + secs : secs;
      var minutes = Math.floor(this.cooldown / 60);
      var minuteStr = minutes < 10 ? "0" + minutes : minutes;
      this.elements.timer.text(minuteStr + ":" + secsStr);

      $(".palette-color").css("cursor", "not-allowed");
      setTimeout(this.updateTime.bind(this), 1000);
    } else {
      this.elements.timer.hide();
      $(".palette-color").css("cursor", "");
    }
  },
  spectate: function (username) {
    if (username.startsWith('@')) {
      username = username.substr(1);
    }
    this.alert('Spectating ' + username);
    this.spectate_user = username;
  },
  mention: function (username) {
    this.elements.usersContainer.hide();
    this.elements.chatContainer.show();
    if (!username.startsWith('@')) username = '@' + username;
    this.elements.chatInput.val(this.elements.chatInput.val() + username + ' ');
    this.elements.chatInput.focus();
  },
  toURL: function () {
    window.open(this.elements.board[0].toDataURL(), '_blank');
  }
};

App.init();