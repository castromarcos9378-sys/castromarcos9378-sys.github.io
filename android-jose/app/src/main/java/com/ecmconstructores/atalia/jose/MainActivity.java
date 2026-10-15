package com.ecmconstructores.atalia.jose;
import android.app.Activity;
import android.os.Bundle;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.view.View;
import android.widget.Toast;
import android.os.Build;

public class MainActivity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> upload;
  private static final int FILE_REQUEST=321;
  private static final String HOME="https://atalia-registro-obra.vercel.app/jose/";
  @Override public void onCreate(Bundle b) {
    super.onCreate(b);
    if(Build.VERSION.SDK_INT>=23 && checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) {
       requestPermissions(new String[]{Manifest.permission.CAMERA}, 123);
    }
    web=new WebView(this);
    setContentView(web);
    WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web,true);
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
        Uri u=req.getUrl();
        if("atalia-registro-obra.vercel.app".equalsIgnoreCase(u.getHost()))return false;
        try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
        return true;
      }
      @Override public void onReceivedError(WebView v,WebResourceRequest req,WebResourceError err){
        if(req.isForMainFrame()) Toast.makeText(MainActivity.this,"Sin conexión. Revisa internet e intenta nuevamente.",Toast.LENGTH_LONG).show();
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
        if(upload!=null)upload.onReceiveValue(null);
        upload=callback;
        try{
          Intent pick=params.createIntent();
          startActivityForResult(pick,FILE_REQUEST);
          return true;
        }catch(Exception e){upload=null;return false;}
      }
      @Override public void onPermissionRequest(PermissionRequest request) {
        runOnUiThread(()->{
          boolean trusted="https://atalia-registro-obra.vercel.app".equals(request.getOrigin().toString());
          if(trusted && checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) request.grant(request.getResources());
          else request.deny();
        });
      }
    });
    web.loadUrl(HOME);
  }
  @Override protected void onActivityResult(int req,int result,Intent data){
    super.onActivityResult(req,result,data);
    if(req==FILE_REQUEST&&upload!=null){
      upload.onReceiveValue(result==RESULT_OK?WebChromeClient.FileChooserParams.parseResult(result,data):null);
      upload=null;
    }
  }
  @Override public void onBackPressed(){
    if(web!=null&&web.canGoBack())web.goBack();
    else super.onBackPressed();
  }
  @Override protected void onDestroy(){
    if(upload!=null){upload.onReceiveValue(null);upload=null;}
    if(web!=null)web.destroy();
    super.onDestroy();
  }
}
