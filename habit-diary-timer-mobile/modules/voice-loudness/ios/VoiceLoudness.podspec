Pod::Spec.new do |s|
  s.name = 'VoiceLoudness'
  s.version = '1.0.0'
  s.summary = 'On-demand local loudness analysis and PCM normalization'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Nino Room'
  s.homepage = 'https://github.com/ryouma0210/nakano-nino-0018'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/ryouma0210/nakano-nino-0018.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'AudioToolbox'
  s.source_files = '**/*.swift'
end
