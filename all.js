// ----- 變數 -----
let data = []
let filterData = []
let routeData = []
let myLayer = null

// 自訂圖釘 icon => 加在 marker 裡面
let myIcon = L.icon({
  iconUrl: 'img/location.png',
  iconSize: [32, 32],
  iconAnchor: [32, 16],
  popupAnchor: [-16, -16],
});

let mymap = L.map('mapId').setView([22.6871251, 120.3142551], 15);
let markers = L.markerClusterGroup();

// Mapbox 服務
L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
  attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
  maxZoom: 18,
  id: 'mapbox/streets-v11',
  tileSize: 512,
  zoomOffset: -1,
  accessToken: 'pk.eyJ1Ijoid2hlYXQwMTIwIiwiYSI6ImNrdjdpMWwxNjQ4MGUycHA2eHI0eTVyMHkifQ.1SVA67os6dCKMhDrej8tYQ'
}).addTo(mymap);

// 使用 navigator web api 獲取當下位置 (lon lat)
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    // success 成功獲取位置
    success => {
      const longitude = success.coords.longitude
      const latitude = success.coords.latitude
      const timestamp = success.timestamp
      let formatTimestamp = new Date(timestamp)
      console.log(success)
      console.log(`(成功獲取當前位置) 經度: ${longitude} 緯度: ${latitude} 時間: ${formatTimestamp}`)
      // render view current position
      mymap.setView([latitude, longitude], 15)
      // (非同步)將經緯度參數傳給 getStationData 執行
      getStationData(longitude, latitude)
    },
    // error 獲取位置失敗
    error => console.error(error.code, error.message)
  )
}

// https://ptx.transportdata.tw/MOTC/v2/Bike/Station/NearBy?$spatialFilter=nearby(22.6871251%2C%20120.3142551%2C%201000)&$format=JSON

// 先取得站位資料
function getStationData(lon, lat) {
  axios({
    method: 'get',
    url: `https://ptx.transportdata.tw/MOTC/v2/Bike/Station/NearBy?$spatialFilter=nearby(${lat},${lon},1000)&$format=JSON`,
    headers: GetAuthorizationHeader()
  })
    .then(res => {
      data = res.data
      console.log('(Bike Station資料讀取成功) data: ', data)
      getAvailableData(lon, lat)
    })
    .catch(err => console.error('TDX Station 資料讀取失敗', err))
}

// 再取得站位自行車數量資料
function getAvailableData(lon, lat) {
  axios({
    method: 'get',
    url: `https://ptx.transportdata.tw/MOTC/v2/Bike/Availability/NearBy?$spatialFilter=nearby(${lat},${lon},1000)&$format=JSON`,
    headers: GetAuthorizationHeader()
  })
    .then(res => {
      const availableData = res.data
      availableData.forEach(availableItem => {
        data.forEach(stationItem => {
          // 比對車站 UID 是否一致
          if (availableItem['StationUID'] === stationItem['StationUID']) {
            availableItem['StationName'] = stationItem['StationName']
            availableItem['StationPosition'] = stationItem['StationPosition']
            availableItem['StationAddress'] = stationItem['StationAddress']
            filterData.push(availableItem)
          }
        })
      })
      console.log('(Bike Available資料讀取成功) filterData: ', filterData)
      setMark()
    })
    .catch(err => console.error('TDX Availability 資料讀取失敗', err))
}

// 設定圖標
function setMark() {
  filterData.forEach(item => {
    markers.addLayer(L.marker([item['StationPosition']['PositionLat'], item['StationPosition']['PositionLon']], { icon: myIcon }))
      .addTo(mymap)
      .bindPopup(
        `
        <div class="card">
          <div class="card__body">
            <h3 class="card__title">${item['StationName']['Zh_tw']}</h3>
            <h4 class="card__subtitle">${item['StationAddress']['Zh_tw']}</h4>
            <p class="card__p card__availableRentCount">可租借車輛數: ${item['AvailableRentBikes']}</p>
            <p class="card__p card__availableReturnCount">可歸還車輛數: ${item['AvailableReturnBikes']}</p>
          </div>
        </div>
        `
      )
  })
  mymap.addLayer(markers)
}

// 選取自行車路線
const bikeRouteSelect = document.querySelector('#bikeRouteSelect')
function getRouteData() {
  axios({
    method: 'get',
    url: `https://ptx.transportdata.tw/MOTC/v2/Cycling/Shape/Kaohsiung?$format=JSON`,
    headers: GetAuthorizationHeader()
  })
    .then(res => {
      routeData = res.data
      console.log('(成功獲取自行車路線) routeData', routeData)
      let str = '<option value="請選擇">請選擇</option>'
      routeData.forEach(item => {
        str += `<option value="${item['RouteName']}">${item['RouteName']}</option>`
      })
      bikeRouteSelect.innerHTML = str
      // 選擇後 => 地圖渲染路線
    })
    .catch(err => console.error('(獲取自行車路線失敗)', err))
}
getRouteData()

// 選擇後 => 地圖渲染路線
function bikeRouteRender(e) {
  const value = e.target.value
  let geo = ''
  // 移除上一個 Polyline
  if (myLayer) {
    // console.log(myLayer)
    mymap.removeLayer(myLayer)
  }
  // 比對選擇自行車道若與 TDX API 資料的 RouteName 一致 => 畫線
  routeData.forEach(item => {
    if (item['RouteName'] === value) {
      geo = item['Geometry']
      polyLineRender(geo)
    }
  })
}

function polyLineRender(geo) {
  // 建立 wkt 實體
  const wicket = new Wkt.Wkt()
  // 讀取 MULTILINESTRING 軌跡資料
  wicket.read(geo)
  // wicket 將 MULTILINESTRING 軌跡資料 轉換成 JSON
  const geojsonFeature = wicket.toJson()
  // 畫圖
  myLayer = L.geoJSON(geojsonFeature).addTo(mymap)
  myLayer.addData(geojsonFeature)
  // setView and zoom
  mymap.fitBounds(myLayer.getBounds())
}

bikeRouteSelect.addEventListener('change', bikeRouteRender, false)

// API 驗證 (TDX 提供)
function GetAuthorizationHeader() {
  var AppID = '298e24d8dcd5462d94df034984044beb';
  var AppKey = 'u2fa9eTpee-g9HdU2diZCLoFDhY';

  var GMTString = new Date().toGMTString();
  var ShaObj = new jsSHA('SHA-1', 'TEXT');
  ShaObj.setHMACKey(AppKey, 'TEXT');
  ShaObj.update('x-date: ' + GMTString);
  var HMAC = ShaObj.getHMAC('B64');
  var Authorization = 'hmac username=\"' + AppID + '\", algorithm=\"hmac-sha1\", headers=\"x-date\", signature=\"' + HMAC + '\"';

  return { 'Authorization': Authorization, 'X-Date': GMTString /*,'Accept-Encoding': 'gzip'*/ }; //如果要將js運行在伺服器，可額外加入 'Accept-Encoding': 'gzip'，要求壓縮以減少網路傳輸資料量
}